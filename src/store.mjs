import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, SOURCES } from './defaults.mjs';
import { now,londonDate,normal,canonical,similarity,normalizeJob,dateOnly } from './util.mjs';
import { assess } from './engine.mjs';
export const STATUSES=['Interested','Preparing','Applied','Interview','Assessment','Offer','Rejected','Withdrawn'];
const PROTECTED=new Set(['Applied','Interview','Assessment','Offer']);
export class Store {
  constructor(dir){
    this.dir=dir;fs.mkdirSync(dir,{recursive:true});this.file=path.join(dir,'fieldwork.sqlite');this.db=new DatabaseSync(this.file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, url TEXT UNIQUE NOT NULL, employer_key TEXT, title_key TEXT, data TEXT NOT NULL, first_seen TEXT NOT NULL,last_seen TEXT NOT NULL, saved INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, archived INTEGER DEFAULT 0, archive_reason TEXT DEFAULT '', archive_exempt INTEGER DEFAULT 0, feedback TEXT DEFAULT '', first_run INTEGER);
      CREATE INDEX IF NOT EXISTS jobs_employer ON jobs(employer_key);
      CREATE TABLE IF NOT EXISTS links (url TEXT PRIMARY KEY, job_id INTEGER REFERENCES jobs(id), source TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS applications (job_id INTEGER PRIMARY KEY REFERENCES jobs(id),status TEXT NOT NULL,data TEXT NOT NULL,ever_applied INTEGER DEFAULT 0,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS application_events (id INTEGER PRIMARY KEY,job_id INTEGER REFERENCES jobs(id),status TEXT,at TEXT);
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY,config TEXT NOT NULL,health TEXT DEFAULT '{}',next_due TEXT);
      CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY,started_at TEXT,finished_at TEXT,status TEXT,trigger TEXT,new_jobs INTEGER DEFAULT 0,checked INTEGER DEFAULT 0,failed INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS source_logs (id INTEGER PRIMARY KEY,run_id INTEGER REFERENCES runs(id),source_id TEXT,at TEXT,status TEXT,discovered INTEGER,new_jobs INTEGER,duplicates INTEGER,rejected INTEGER,details TEXT);
      CREATE TABLE IF NOT EXISTS commute_cache (key TEXT PRIMARY KEY,data TEXT NOT NULL,expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY,owner TEXT,expires_at TEXT);
      PRAGMA user_version=1;`);
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (1,?)').run(JSON.stringify(DEFAULTS));
    const ins=this.db.prepare('INSERT OR IGNORE INTO sources(id,config,next_due) VALUES(?,?,?)');for(const s of SOURCES)ins.run(s.id,JSON.stringify(s),now());
  }
  settings(){return {...DEFAULTS,...JSON.parse(this.db.prepare('SELECT value FROM settings WHERE id=1').get().value)}}
  saveSettings(delta){const v={...this.settings(),...delta};this.db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(v));return v}
  sources(){return this.db.prepare('SELECT * FROM sources').all().map(r=>({...JSON.parse(r.config),health:JSON.parse(r.health),next_due:r.next_due}))}
  putSource(s){this.db.prepare('INSERT INTO sources(id,config,next_due) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config').run(s.id,JSON.stringify(s),now())}
  jobs(){return this.db.prepare('SELECT * FROM jobs ORDER BY first_seen DESC').all().map(r=>this.expand(r))}
  job(id){const r=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);return r?this.expand(r):null}
  expand(r){const application=this.db.prepare('SELECT * FROM applications WHERE job_id=?').get(r.id);return {...JSON.parse(r.data),id:r.id,first_seen:r.first_seen,last_seen:r.last_seen,saved:!!r.saved,hidden:!!r.hidden,archived:!!r.archived,archive_reason:r.archive_reason,archive_exempt:!!r.archive_exempt,feedback:r.feedback,first_run:r.first_run,
    links:this.db.prepare('SELECT url,source FROM links WHERE job_id=?').all(r.id),application:application?{...JSON.parse(application.data),status:application.status,ever_applied:!!application.ever_applied,updated_at:application.updated_at}:null};}
  ingest(raw,runId=null){
    const j=normalizeJob(raw);if(!j.title||!j.url)throw Error('A title and valid application URL are required');
    let existing=this.db.prepare('SELECT j.* FROM jobs j LEFT JOIN links l ON l.job_id=j.id WHERE j.url=? OR l.url=? LIMIT 1').get(j.url,j.url);
    // Older saved Indeed URLs may contain tracking parameters or use vjk.
    // Resolve these without rewriting stored jobs or losing application records.
    if(!existing&&j.url.startsWith('https://uk.indeed.com/viewjob?jk=')){
      const link=this.db.prepare("SELECT url,job_id FROM links WHERE url LIKE '%indeed.%'").all().find(l=>canonical(l.url)===j.url);
      if(link)existing=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(link.job_id);
    }
    if(!existing&&normal(j.employer)!=='employer unverified'){
      existing=this.db.prepare('SELECT * FROM jobs WHERE employer_key=?').all(normal(j.employer)).find(r=>{
        const d=JSON.parse(r.data),sameRef=j.reference&&d.reference&&j.reference===d.reference;
        if(j.url.startsWith('https://uk.indeed.com/viewjob?jk=')&&canonical(d.url).startsWith('https://uk.indeed.com/viewjob?jk=')&&canonical(d.url)!==j.url)return false;
        if(j.reference&&d.reference&&j.reference!==d.reference)return false;
        const recent=Math.abs(new Date(j.posting_date||now())-new Date(d.posting_date||r.first_seen))<45*86400000;
        return sameRef||(recent&&normal(d.location)===normal(j.location)&&similarity(j.title,d.title)>=0.9);
      });
    }
    let id;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      if(existing){
        id=existing.id;const old=JSON.parse(existing.data), prefer=j.direct&&!old.direct;
        const merged={...old,...Object.fromEntries(Object.entries(j).filter(([k,v])=>v!==''&&v!==null&&v!==undefined&&!(k==='description'&&v.length<old.description?.length))),url:prefer?j.url:old.url,
          review:old.review,commute:old.commute,workplace:old.workplace||j.workplace,nearest_station:old.nearest_station||j.nearest_station,credible:old.credible||j.credible};
        merged.assessment=assess(merged,this.settings());
        this.db.prepare('UPDATE jobs SET url=?,data=?,last_seen=? WHERE id=?').run(merged.url,JSON.stringify(merged),now(),id);
      }else{
        j.assessment=assess(j,this.settings());id=Number(this.db.prepare('INSERT INTO jobs(url,employer_key,title_key,data,first_seen,last_seen,first_run) VALUES(?,?,?,?,?,?,?)').run(j.url,normal(j.employer),normal(j.title),JSON.stringify(j),now(),now(),runId).lastInsertRowid);
      }
      this.db.prepare('INSERT OR IGNORE INTO links(url,job_id,source) VALUES(?,?,?)').run(j.url,id,j.source);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
    return {id,isNew:!existing,job:this.job(id)};
  }
  updateJob(id,delta){const row=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!row)throw Error('Job not found');
    const fields=['saved','hidden','archived','archive_exempt'];for(const k of fields)if(k in delta)this.db.prepare(`UPDATE jobs SET ${k}=? WHERE id=?`).run(delta[k]?1:0,id);
    if(delta.archived===false)this.db.prepare("UPDATE jobs SET archive_reason='',archive_exempt=1 WHERE id=?").run(id);
    const data=JSON.parse(row.data);for(const k of ['workplace','nearest_station','commute','review','credible','verified_open','closing_date','office_days','work_pattern','remote_uk','salary','grade'])if(k in delta)data[k]=delta[k];
    if(delta.verified_open)data.fetched_at=now();data.assessment=assess(data,this.settings());
    this.db.prepare('UPDATE jobs SET data=? WHERE id=?').run(JSON.stringify(data),id);return this.job(id);
  }
  reassess(){const settings=this.settings(), stmt=this.db.prepare('UPDATE jobs SET data=? WHERE id=?');this.db.exec('BEGIN');try{for(const r of this.db.prepare('SELECT id,data FROM jobs').all()){const j=JSON.parse(r.data);j.assessment=assess(j,settings);stmt.run(JSON.stringify(j),r.id)}this.db.exec('COMMIT')}catch(e){this.db.exec('ROLLBACK');throw e}}
  application(id,delta){
    if(!this.job(id))throw Error('Job not found');const status=delta.status;if(!STATUSES.includes(status))throw Error('Invalid application status');
    const old=this.job(id).application||{};const allowed=['notes','application_date','closing_date','interview_date','salary','contact','application_url','cv_version','cover_letter_status','follow_up_date'];
    const data={...old};for(const k of allowed)if(k in delta){if(typeof delta[k]!=='string'||delta[k].length>30000)throw Error(`Invalid ${k}`);data[k]=delta[k];}
    for(const k of ['application_date','closing_date','interview_date','follow_up_date'])if(data[k]&&!dateOnly(data[k]))throw Error(`Invalid ${k}`);
    if(data.application_url&&!canonical(data.application_url))throw Error('Invalid application URL');
    if(status==='Applied'&&!data.application_date)data.application_date=londonDate();
    const applied=old.ever_applied||PROTECTED.has(status)||!!data.application_date;
    this.db.exec('BEGIN');try{
      this.db.prepare('INSERT INTO applications(job_id,status,data,ever_applied,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,data=excluded.data,ever_applied=excluded.ever_applied,updated_at=excluded.updated_at').run(id,status,JSON.stringify(data),applied?1:0,now());
      if(old.status!==status)this.db.prepare('INSERT INTO application_events(job_id,status,at) VALUES(?,?,?)').run(id,status,now());
      this.db.prepare("UPDATE jobs SET archived=0,archive_reason='',hidden=0 WHERE id=?").run(id);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e}return this.job(id);
  }
  feedback(id,value){if(!['Great match','Relevant','Not for me',''].includes(value))throw Error('Invalid feedback');this.db.prepare('UPDATE jobs SET feedback=? WHERE id=?').run(value,id);
    const weights={};for(const j of this.jobs().filter(x=>x.feedback)){const n={'Great match':2,Relevant:1,'Not for me':-2}[j.feedback];weights[j.assessment.family]=(weights[j.assessment.family]||0)+n;for(const k of j.assessment.matched)weights[k]=(weights[k]||0)+n*0.2;}
    for(const k of Object.keys(weights))weights[k]=Math.max(-8,Math.min(8,weights[k]));this.saveSettings({weights});this.reassess();return this.job(id);
  }
  housekeeping(at=new Date()){
    const yesterday=londonDate(new Date(+at-86400000));let count=0;
    for(const j of this.jobs()){
      if(j.archived||j.archive_exempt||!j.closing_date||j.closing_date>=yesterday||j.application?.ever_applied||PROTECTED.has(j.application?.status))continue;
      this.db.prepare("UPDATE jobs SET archived=1,archive_reason='Expired / Not Applied' WHERE id=?").run(j.id);count++;
    }
    this.saveSettings({last_housekeeping:londonDate(at)});return count;
  }
  acquire(owner){const t=now(), until=new Date(Date.now()+5*60000).toISOString();return this.db.prepare("INSERT INTO leases(name,owner,expires_at) VALUES('search',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<?").run(owner,until,t).changes>0;}
  renew(owner){this.db.prepare("UPDATE leases SET expires_at=? WHERE name='search' AND owner=?").run(new Date(Date.now()+5*60000).toISOString(),owner)}
  release(owner){this.db.prepare("DELETE FROM leases WHERE name='search' AND owner=?").run(owner)}
  busy(){return !!this.db.prepare("SELECT 1 FROM leases WHERE name='search' AND expires_at>?").get(now())}
  async backup(dest){fs.mkdirSync(path.dirname(dest),{recursive:true});await backup(this.db,dest);return dest}
  close(){this.db.close()}
}
