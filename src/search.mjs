import {randomUUID} from 'node:crypto';
import {fetchSource} from './sources.mjs';
import {route} from './commute.mjs';
import {now,londonDate} from './util.mjs';
export async function search(store,{force=false,query='',source_id='',trigger='manual',adapter=fetchSource}={}){
  const owner=randomUUID();if(!store.acquire(owner))return {busy:true};
  const heartbeat=setInterval(()=>store.renew(owner),30000);let runId,checked=0,failed=0,newJobs=0,partial=0;
  try{
    store.db.prepare("UPDATE runs SET status='interrupted',finished_at=? WHERE status='running'").run(now());
    runId=Number(store.db.prepare("INSERT INTO runs(started_at,status,trigger) VALUES(?,'running',?)").run(now(),trigger+(query?`: ${query}`:'')).lastInsertRowid);
    const cfg=store.settings();const sources=store.sources().filter(s=>s.enabled&&(!source_id||source_id===s.id)&&(force||s.next_due<=now()));
    for(const s of sources){
      let status='success',discovered=0,added=0,duplicates=0,rejected=0,details={warnings:[],reasons:{}};
      try{
        const result=await adapter(s,cfg,{query});details.warnings=result.warnings||[];if(result.manual)status='manual';else if(result.unconfigured)status='unconfigured';else {checked++;if(result.limited||details.warnings.length)status='partial'}
        details.limited=!!result.limited;details.scanned=result.scanned??result.jobs.length;details.scope_filtered=result.scope_filtered||0;discovered=result.jobs.length;
        for(const raw of result.jobs){try{
          const r=store.ingest(raw,runId);if(r.isNew)added++;else duplicates++;
          if(r.job.assessment.category==='Filtered'){rejected++;for(const reason of r.job.assessment.barriers)details.reasons[reason]=(details.reasons[reason]||0)+1;}
          else if(r.job.workplace&&r.job.assessment.matched.length>=2&&(!r.job.commute||r.job.commute.expires_at&&r.job.commute.expires_at<now()||r.job.commute.minutes==null&&(!r.job.commute.checked_at||Date.now()-new Date(r.job.commute.checked_at)>3600000))){const commute=await route(store,r.job);store.updateJob(r.id,{commute});}
        }catch(e){details.warnings.push(`Advert skipped: ${e.message}`);status='partial'}}
        if(discovered===0&&!result.scanned&&details.warnings.length&&!result.manual&&!result.unconfigured){status='failed';failed++;checked--;}
        newJobs+=added;
      }catch(e){status='failed';failed++;details.warnings.push(e.message)}
      const at=now();const health={status,at,discovered,new_jobs:added,duplicates,rejected,...details};
      if(status==='partial')partial++;
      // A failed endpoint retries after one hour, without erasing its last successful timestamp.
      const old=s.health||{};health.last_success=['success','partial'].includes(status)?at:old.last_success||null;
      const due=new Date(Date.now()+(status==='failed'?1:s.interval_hours||24)*3600000).toISOString();
      if(!query){store.db.prepare('UPDATE sources SET health=?,next_due=? WHERE id=?').run(JSON.stringify(health),due,s.id)}
      store.db.prepare('INSERT INTO source_logs(run_id,source_id,at,status,discovered,new_jobs,duplicates,rejected,details) VALUES(?,?,?,?,?,?,?,?,?)').run(runId,s.id,at,status,discovered,added,duplicates,rejected,JSON.stringify(details));
      store.db.prepare('UPDATE runs SET new_jobs=?,checked=?,failed=? WHERE id=?').run(newJobs,checked,failed,runId);
      store.renew(owner);
    }
    store.housekeeping();store.reassess();const status=checked?(failed||partial?'partial':'success'):failed?'failed':'no_automatic_sources';
    store.db.prepare('UPDATE runs SET finished_at=?,status=?,new_jobs=?,checked=?,failed=? WHERE id=?').run(now(),status,newJobs,checked,failed,runId);
    return {id:runId,status,new_jobs:newJobs,checked,failed};
  }catch(e){if(runId)store.db.prepare("UPDATE runs SET finished_at=?,status='failed' WHERE id=?").run(now(),runId);throw e}
  finally{clearInterval(heartbeat);store.release(owner)}
}
export async function tick(store,{startup=false,run=search}={}){
  const cfg=store.settings();if(cfg.last_housekeeping!==londonDate()){store.housekeeping();store.reassess()}
  if(!cfg.auto_search||(startup&&!cfg.catch_up)||store.busy())return;
  const due=store.sources().some(s=>s.enabled&&s.type!=='manual'&&!(s.type==='brave'&&!cfg.brave_key)&&s.next_due<=now());
  if(due)return run(store,{trigger:startup?'startup catch-up':'scheduled'});
}
