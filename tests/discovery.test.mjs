import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fetchSource} from '../src/sources.mjs';
import {sourceFromURL} from '../src/catalog.mjs';
import {assess,normaliseSkills} from '../src/engine.mjs';
import {normalizeJob} from '../src/util.mjs';
import {inferWorkplace,extractPostcode} from '../src/places.mjs';
import {Store} from '../src/store.mjs';
import {RETIRED_SOURCES,SOURCES} from '../src/defaults.mjs';

const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fieldwork-disc-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir};

test('free-text skills map onto recognised engine signals and report the rest',()=>{
  const {skills,unrecognised}=normaliseSkills(['Python (pandas, NumPy)','SQL / DuckDB','Data visualization','Shiny for Python','Git/GitHub','Bioinformatics','Juggling']);
  for(const k of ['python','pandas','numpy','sql','duckdb','visualisation','dashboards','git','bioinformatics'])assert(skills.includes(k),k);
  assert.deepEqual(unrecognised,['Juggling']);
  assert.deepEqual(normaliseSkills(['R']).skills,['r']);
  assert(!normaliseSkills(['research']).skills.includes('r'));
});

const desc='We are recruiting a graduate data analyst to support our scientific evidence team. You will analyse biological research datasets in Python and pandas, carry out statistical analysis and build data visualisation for policy colleagues. Training is provided and this is a supportive first role.\nEssential\nDegree in a biological or quantitative subject\nPython and statistics\nExperience of stakeholder engagement in a regulated environment\nDesirable\nKnowledge of plant health';
const base=extra=>normalizeJob({title:'Graduate Data Analyst',employer:'Example Agency',url:'https://example.org/j/1',location:'London',description:desc,credible:true,verified_open:true,closing_date:'2099-01-01',...extra});

test('free-text skills in settings now produce matches (previously exact keys only)',()=>{
  const typed={skills:['Python (pandas)','Statistics','Biology','Research','Data visualization'],origin_routing:'o',origin:'o'};
  const a=assess(base(),typed);
  assert(a.matched.length>=4,'matched: '+a.matched.join());
});

test('Strong Match tolerates one or two unrecognised essential criteria but not missing requirements',()=>{
  const profile={skills:['python','pandas','statistics','biology','research','visualisation'],origin_routing:'o',origin:'o'};
  const a=assess(base(),profile);
  assert.equal(a.gates.requirements,false);
  assert.equal(a.category,'Strong Match');
  assert.match(a.issues.join(),/need your review/);
  // No visible requirements at all: stays a conditional lead.
  assert.notEqual(assess(base({requirements:{essential:[],desirable:[]}}),profile).category,'Strong Match');
  // A genuine barrier still filters.
  assert.equal(assess(base({description:desc+'\nEssential\nAt least 4 years of professional experience required.'}),profile).category,'Filtered');
});

test('wet-lab exclusion is opt-in and spares computational roles',()=>{
  const profile={skills:['python','statistics','biology','research'],avoid_wet_lab:true};
  const lab=normalizeJob({title:'Laboratory Technician',employer:'X',url:'https://x.org/1',location:'London',description:'Prepare samples, cell culture and PCR in our laboratory. Research team.'});
  assert.equal(assess(lab,profile).category,'Filtered');
  assert.notEqual(assess(lab,{...profile,avoid_wet_lab:false}).category,'Filtered');
  const comp=normalizeJob({title:'Bioinformatics Research Assistant',employer:'X',url:'https://x.org/2',location:'London',description:'Analyse sequencing data from cell culture, PCR and ELISA experiments with Python. Microscopy images too.'});
  assert(!assess(comp,profile).barriers.some(b=>/wet-lab/.test(b)));
});

test('workplaces are inferred from postcodes and known sites, with provenance',()=>{
  assert.equal(extractPostcode('Midland Road, London NW1 1AT'),'NW1 1AT');
  assert.equal(extractPostcode('London nw1 1at'),'');
  assert.equal(inferWorkplace({location:'London, SE11 5JH'}).workplace,'SE11 5JH');
  assert.equal(inferWorkplace({location:'London',employer:'The Francis Crick Institute'}).workplace,'NW1 1AT');
  const ukhsa=inferWorkplace({location:'London',employer:'UK Health Security Agency',description:'Interviews and the role will be based at Colindale.'});
  assert.equal(ukhsa.workplace,'NW9 5EQ');assert.match(ukhsa.workplace_note,/confirm/);
  assert.equal(inferWorkplace({location:'London',employer:"King's College London"}),null);
  assert.equal(inferWorkplace({location:'London',employer:'University College London Hospitals NHS Foundation Trust'}),null);
  const j=normalizeJob({title:'Data Scientist',employer:'Natural History Museum',url:'https://x.org/3',location:'South Kensington'});
  assert.equal(j.workplace,'SW7 2AZ');assert.match(j.workplace_note,/Known site/);
  assert.equal(normalizeJob({title:'T',url:'https://x.org/4',workplace:'E1 4NS'}).workplace_note,'');
});

test('Workable connector reads the public widget feed and only claims UK remote with evidence',async()=>{
  const request=async(url,opts)=>{assert.match(url,/apply\.workable\.com\/api\/v1\/widget\/accounts\/our-future-health\?details=true/);assert.equal(opts.json,true);
    return {jobs:[
      {title:'Data Engineer (NHS Data)',shortcode:'ABC',employment_type:'Full-time',telecommuting:false,url:'https://apply.workable.com/j/ABC',published_on:'2026-10-16',city:'London',country:'United Kingdom',locations:[{country:'United Kingdom',city:'London',region:'England',hidden:false}],description:'<p>Python and SQL</p>'},
      {title:'Office Manager',shortcode:'DEF',telecommuting:false,url:'https://apply.workable.com/j/DEF',city:'London',country:'United Kingdom',description:''},
      {title:'Research Data Scientist',shortcode:'GHI',telecommuting:true,url:'https://apply.workable.com/j/GHI',locations:[{country:'United Kingdom',city:'Manchester'}],description:'Remote'}]}};
  const r=await fetchSource({type:'workable',board:'our-future-health',name:'Our Future Health'},{},{request});
  assert.equal(r.jobs.length,2);assert.equal(r.scope_filtered,1);
  const [a,b]=r.jobs;assert.equal(a.url,'https://apply.workable.com/j/ABC');assert.equal(a.reference,'ABC');assert.equal(a.posting_date,'2026-10-16');assert.equal(a.remote_uk,false);assert.match(a.location,/London/);
  assert.equal(b.remote_uk,true);
  await assert.rejects(fetchSource({type:'workable',board:'x',name:'x'},{},{request:async()=>({oops:1})}),/Workable schema/);
});

test('Pinpoint connector reads postings.json with workplace postcode, salary and hybrid status',async()=>{
  const request=async url=>{assert.equal(url,'https://bactobio.pinpointhq.com/postings.json');return {data:[{id:1,title:'Bioinformatics Applied AI Engineer',url:'https://bactobio.pinpointhq.com/en/postings/eb1',description:'<p>Build AI workflows</p>',key_responsibilities:'<li>Python pipelines</li>',
    location:{city:'London',name:'London',postal_code:'SE11 5JH',province:'England',street_address:'Unit 408 Vox Studios'},workplace_type:'hybrid',compensation_visible:true,compensation_currency:'GBP',compensation_frequency:'year',compensation_minimum:45000.0,compensation_maximum:65000.0,deadline_at:null,employment_type:'permanent_full_time',job:{requisition_id:'BI_AAE_2609'}}]}};
  const r=await fetchSource({type:'pinpoint',board:'bactobio',name:'Bactobio'},{},{request});
  const j=r.jobs[0];assert.equal(j.workplace,'SE11 5JH');assert.equal(j.work_pattern,'Hybrid');assert.equal(j.salary_min,45000);assert.equal(j.salary_max,65000);assert.equal(j.reference,'BI_AAE_2609');assert.match(j.description,/Python pipelines/);assert.equal(j.remote_uk,false);
});

test('Greenhouse EU boards, Workable and Pinpoint URLs resolve to connectors',()=>{
  const g=sourceFromURL('https://job-boards.eu.greenhouse.io/prolificacademicltd/jobs/4835919101');assert.equal(g.type,'greenhouse');assert.equal(g.region,'eu');assert.equal(g.name,'Prolific');
  const w=sourceFromURL('https://apply.workable.com/our-future-health/j/8D2F3568AE/');assert.equal(w.type,'workable');assert.equal(w.board,'our-future-health');assert.equal(w.credible,true);
  assert.throws(()=>sourceFromURL('https://apply.workable.com/j/8D2F3568AE'));
  const p=sourceFromURL('https://bactobio.pinpointhq.com/en/postings/eb136b17');assert.equal(p.type,'pinpoint');assert.equal(p.board,'bactobio');
});

test('Greenhouse EU requests use the EU API host',async()=>{
  let seen;await fetchSource({type:'greenhouse',board:'prolificacademicltd',region:'eu',name:'Prolific'},{},{request:async u=>{seen=u;return {jobs:[]}}});
  assert.equal(seen,'https://boards-api.eu.greenhouse.io/v1/boards/prolificacademicltd/jobs?content=true');
});

test('existing installs retire noisy default boards once, without deleting them, and gain new sources',t=>{
  const dir=tmp(t),file=path.join(dir,'fieldwork.sqlite');
  // Simulate a v1 database that still has the old broad-tech defaults enabled.
  const old=new DatabaseSync(file);
  old.exec("CREATE TABLE sources (id TEXT PRIMARY KEY,config TEXT NOT NULL,health TEXT DEFAULT '{}',next_due TEXT); PRAGMA user_version=1;");
  for(const id of RETIRED_SOURCES)old.prepare('INSERT INTO sources(id,config,next_due) VALUES(?,?,?)').run(id,JSON.stringify({id,name:id,type:'greenhouse',board:id,enabled:true}),'2026-01-01');
  old.close();
  let s=new Store(dir);
  try{
    const byId=Object.fromEntries(s.sources().map(x=>[x.id,x]));
    for(const id of RETIRED_SOURCES){assert.equal(byId[id].enabled,false,id);assert.match(byId[id].retired_note,/Re-enable/)}
    for(const x of SOURCES)assert(byId[x.id],'missing default '+x.id);
    // A user re-enable survives restart (migration runs once).
    const veeva=byId['lever-veeva'];s.putSource({...veeva,enabled:true});s.close();
    s=new Store(dir);assert.equal(s.sources().find(x=>x.id==='lever-veeva').enabled,true);
  }finally{s.close()}
});

test('default sources are targeted: no broad tech boards, more science queries',()=>{
  const ids=SOURCES.map(s=>s.id);
  for(const id of RETIRED_SOURCES)assert(!ids.includes(id),id);
  assert(SOURCES.some(s=>s.type==='workable')&&SOURCES.some(s=>s.type==='pinpoint'));
  assert(SOURCES.filter(s=>s.type==='academic'&&s.location==='London').length>=9);
});

test('"Python or R" is satisfied by Python; a bare R requirement is still flagged',()=>{
  const profile={skills:['python','statistics','biology','research'],origin_routing:'o',origin:'o'};
  const mk=line=>normalizeJob({title:'Research Assistant',employer:'X',url:'https://x.org/r'+line.length,location:'London',description:desc+'\nEssential\n'+line});
  assert(!assess(mk('Python or R programming'),profile).issues.some(i=>/: R$/.test(i)));
  assert(!assess(mk('Proficiency in R, Stata or Python'),profile).issues.some(i=>/: R$/.test(i)));
  assert(assess(mk('Proficiency in R is essential'),profile).issues.some(i=>/: R$/.test(i)));
});

test('Civil Service AO/EO/HEO grades count as early-career evidence; SEO does not',()=>{
  const profile={skills:['python','statistics','biology','research'],origin_routing:'o',origin:'o'};
  const mk=grade=>normalizeJob({title:'Scientific Data Analyst',employer:'Example Agency',url:'https://x.org/g'+grade,location:'London',description:`Grade: ${grade}. `+desc});
  assert.equal(assess(mk('HEO'),profile).early_career,true);
  assert.equal(assess(mk('EO'),profile).early_career,true);
  const seo=normalizeJob({title:'Scientific Data Analyst',employer:'Example Agency',url:'https://x.org/seo',location:'London',description:'Senior Executive Officer (SEO). We need an analyst for our evidence team using Python. '+'x'.repeat(260)});
  assert.equal(assess(seo,profile).early_career,false);
});
