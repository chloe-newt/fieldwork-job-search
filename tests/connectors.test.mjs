import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fetchSource} from '../src/sources.mjs';
import {canonical} from '../src/util.mjs';
import {advertDraft} from '../src/import.mjs';
import {SOURCE_CATALOG,sourceFromURL} from '../src/catalog.mjs';
import {Store} from '../src/store.mjs';

test('Ashby imports listed roles, secondary UK locations and advertised pay without guessing remote eligibility',async()=>{
  let called;
  const jobs=[
    {title:'Graduate Data Analyst',id:'uk',isListed:true,location:'London, UK',workplaceType:'Hybrid',descriptionPlain:'Python data research',publishedAt:'2026-09-01T09:00:00Z',compensation:{compensationTierSummary:'£32,000 – £36,000 per annum'},jobUrl:'https://jobs.ashbyhq.com/example/uk'},
    {title:'Research Scientist',id:'multi',isListed:true,location:'Berlin, Germany',secondaryLocations:[{location:'London, United Kingdom'}],workplaceType:'Remote',descriptionPlain:'Biology research',jobUrl:'https://jobs.ashbyhq.com/example/multi'},
    {title:'Data Analyst',id:'unknown',isListed:true,location:'Remote',isRemote:true,jobUrl:'https://jobs.ashbyhq.com/example/unknown'},
    {title:'Data Analyst',id:'hidden',isListed:false,location:'London',jobUrl:'https://jobs.ashbyhq.com/example/hidden'},
    {title:'Data Analyst',id:'us',isListed:true,location:'United States',isRemote:true,jobUrl:'https://jobs.ashbyhq.com/example/us'},
    {title:'Account Executive',id:'sales',isListed:true,location:'London',jobUrl:'https://jobs.ashbyhq.com/example/sales'}
  ];
  const result=await fetchSource({type:'ashby',board:'example',name:'Example',credible:true},{},{request:async(url,opts)=>{called=url;assert.equal(opts.json,true);return {jobs}}});
  assert.equal(called,'https://api.ashbyhq.com/posting-api/job-board/example?includeCompensation=true');
  assert.equal(result.jobs.length,3);assert.equal(result.scanned,5);assert.equal(result.scope_filtered,2);
  const uk=result.jobs.find(j=>j.reference==='uk');assert.equal(uk.salary_min,32000);assert.equal(uk.work_pattern,'Hybrid');assert.equal(uk.remote_uk,false);assert.equal(uk.verified_open,true);assert.equal(uk.posting_date,'2026-09-01');
  assert.equal(result.jobs.find(j=>j.reference==='multi').remote_uk,true);
  assert.equal(result.jobs.find(j=>j.reference==='unknown').remote_uk,false);
});

test('Ashby schema errors surface as failures, not empty successful searches',async()=>{
  await assert.rejects(fetchSource({type:'ashby',board:'example',name:'Example'},{},{request:async()=>({error:'Missing'})}),/Unexpected Ashby schema/);
});

test('hosted careers URLs resolve locally, including European Lever, and reject unrelated hosts',()=>{
  for(const [url,type,board] of [
    ['https://jobs.ashbyhq.com/synthesia/some-job','ashby','synthesia'],
    ['https://job-boards.greenhouse.io/riverlane/jobs/42','greenhouse','riverlane'],
    ['https://boards.greenhouse.io/riverlane','greenhouse','riverlane'],
    ['https://jobs.lever.co/example/id','lever','example'],
    ['https://careers.smartrecruiters.com/LGCGroup','smartrecruiters','LGCGroup']
  ]){const s=sourceFromURL(url);assert.equal(s.type,type);assert.equal(s.board,board)}
  assert.equal(sourceFromURL('https://jobs.eu.lever.co/example/id').region,'eu');
  assert.equal(sourceFromURL('https://jobs.ashbyhq.com/synthesia').name,'Synthesia');
  assert.equal(sourceFromURL('https://jobs.ashbyhq.com/unknown').credible,false);
  for(const url of ['https://jobs.ashbyhq.com.evil.example/foo','http://jobs.ashbyhq.com/foo','https://jobs.ashbyhq.com/','https://user:pass@jobs.ashbyhq.com/foo','https://jobs.ashbyhq.com/%2e%2e'])assert.throws(()=>sourceFromURL(url));
  assert.equal(new Set(SOURCE_CATALOG.map(c=>c.id)).size,11);
});

test('Indeed link variants canonicalise by job key without accepting spoofed domains',()=>{
  const expected='https://uk.indeed.com/viewjob?jk=abc123def456';
  for(const url of ['https://uk.indeed.com/viewjob?jk=abc123def456&utm_source=email','https://www.indeed.com/jobs?q=analyst&vjk=abc123def456','https://uk.indeed.com/rc/clk?jk=abc123def456&from=search','https://www.indeed.co.uk/viewjob?jk=abc123def456'])assert.equal(canonical(url),expected);
  assert.notEqual(canonical('https://indeed.com.evil.example/viewjob?jk=abc123def456'),expected);
  assert.notEqual(canonical('https://uk.indeed.com/viewjob?jk=different123'),expected);
});

test('pasted advert preview extracts explicit labels but never grants evidence or invents missing fields',()=>{
  const draft=advertDraft({url:'https://uk.indeed.com/jobs?vjk=abc123def456',description:'Job title: Graduate Data Analyst\nEmployer: Example Institute\nLocation: London\nPay: £34,000 a year\nEssential\nPython and SQL\nDesirable\nPlant biology'});
  assert.equal(draft.title,'Graduate Data Analyst');assert.equal(draft.employer,'Example Institute');assert.equal(draft.salary,'£34,000 a year');assert.equal(draft.source,'Indeed · pasted advert');assert.equal(draft.reference,'abc123def456');
  assert.equal(draft.verified_open,false);assert.equal(draft.credible,false);assert.equal(draft.remote_uk,false);assert.match(draft.description,/Essential\nPython and SQL\nDesirable/);
  const unknown=advertDraft({url:'https://example.org/job',description:'We are a research company and this is our full advert text.'});
  assert.equal(unknown.title,'');assert.equal(unknown.employer,'');assert.equal(unknown.salary,'');
  assert.throws(()=>advertDraft({url:'javascript:alert(1)',description:'Long enough text to pass the length check'}),/valid vacancy URL/);
  assert.throws(()=>advertDraft({url:'https://example.org/job',description:'short'}),/full advert/);
});

test('Indeed duplicates retain existing application records, including legacy tracking URLs',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fieldwork-indeed-'));const store=new Store(dir);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});
  const raw={title:'Data Analyst',employer:'Example',url:'https://uk.indeed.com/viewjob?jk=abc123def456',description:'Python research',location:'London'};
  const first=store.ingest(raw);store.application(first.id,{status:'Applied',notes:'Keep this application'});
  const legacy='https://www.indeed.com/jobs?vjk=abc123def456&from=search';
  const data=store.job(first.id);data.url=legacy;
  store.db.prepare('UPDATE jobs SET url=?,data=? WHERE id=?').run(legacy,JSON.stringify(data),first.id);
  store.db.prepare('UPDATE links SET url=? WHERE job_id=?').run(legacy,first.id);
  const duplicate=store.ingest({...raw,employer:'Example renamed',url:'https://uk.indeed.com/rc/clk?jk=abc123def456&from=other'});
  assert.equal(duplicate.id,first.id);assert.equal(duplicate.isNew,false);assert.equal(store.jobs().length,1);assert.equal(store.job(first.id).application.notes,'Keep this application');
  const other=store.ingest({...raw,url:'https://uk.indeed.com/viewjob?jk=different123'});assert.equal(other.isNew,true);
});
