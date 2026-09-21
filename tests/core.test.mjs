import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {assess as assessEngine,extractRequirements,classifyFamily} from '../src/engine.mjs';
import {route} from '../src/commute.mjs';
import {normalizeJob,canonical,dateOnly,londonDate} from '../src/util.mjs';
import {structuredJobs,parseNHS} from '../src/sources.mjs';
import {robotsAllowed,isPrivate} from '../src/network.mjs';
import {search,tick} from '../src/search.mjs';
// Synthetic profile for rule tests; not a real person's qualifications or location.
const TEST_PROFILE={skills:['python','pandas','statistics','biology','research','visualisation','databases'],qualifications:['bsc'],origin:'Test origin',origin_routing:'test-origin',commute_limit:35};
const assess=(vacancy,config={},at)=>assessEngine(vacancy,{...TEST_PROFILE,...config},at);
const full='We are seeking a graduate research data analyst to support biological research. You will analyse datasets, use Python and pandas, perform statistical analysis and create visualisation for our research team. This role includes supervised research projects and training.\nEssential\nBSc in biological science\nPython and statistics skills\nDesirable\nR and plant science experience preferred.';
const job=(extra={})=>normalizeJob({title:'Graduate Research Data Analyst',employer:'Example Research Institute',url:'https://example.org/jobs/42',location:'London, UK',description:full,work_pattern:'Remote',remote_uk:true,credible:true,verified_open:true,closing_date:'2099-12-31',salary:'£32,000 – £36,000 per annum',...extra});
function db(t,profile=TEST_PROFILE){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fieldwork-test-'));const s=new Store(dir);s.saveSettings(profile);t.after(()=>{try{s.close()}catch{}fs.rmSync(dir,{recursive:true,force:true})});return s}

test('fresh installations require a personal profile and preserve saved settings across restart',t=>{
  const s=db(t,{});assert.equal(s.settings().origin_routing,'');assert.deepEqual(s.settings().skills,[]);assert.deepEqual(s.settings().qualifications,[]);assert.equal(s.settings().profile_summary,'');
  assert.notEqual(assessEngine(job()).category,'Complete Hit');
  s.saveSettings(TEST_PROFILE);s.close();const reopened=new Store(s.dir);
  try{for(const [key,value] of Object.entries(TEST_PROFILE))assert.deepEqual(reopened.settings()[key],value)}finally{reopened.close()}
});

test('missing commute origin never creates a route or passes the location gate',async t=>{
  const s=db(t,{}),result=await route(s,{workplace:'E14 5AB'});assert.equal(result.minutes,null);assert.match(result.reason,/origin in Settings/);
  assert.equal(assess(job({remote_uk:false,commute:{origin:'',destination:'Test destination',minutes:10}}),{origin_routing:''}).gates.location,false);
});
test('Complete Hit requires all eight evidence gates',()=>{const a=assess(job());assert.equal(a.category,'Complete Hit');assert.equal(Object.values(a.gates).every(Boolean),true);for(const d of [{credible:false},{verified_open:false},{remote_uk:false},{description:'Python data biology'}])assert.notEqual(assess(job(d)).category,'Complete Hit')});
test('mandatory experience blocks junior titles; desirable experience does not',()=>{
  assert.equal(assess(job({description:full+'\nEssential\nAt least 5 years of professional experience required.'})).category,'Filtered');
  const a=assess(job({description:full+'\nDesirable\n5 years of experience preferred.'}));assert.notEqual(a.category,'Filtered');assert.match(a.issues.join(),/preferred/);
});
test('word-number experience requirements are recognised',()=>assert.equal(assess(job({description:full+'\nEssential\nThree years of industry experience required.'})).category,'Filtered'));
test('senior titles, professional credentials and unrelated childcare are filtered',()=>{
  for(const extra of [{title:'Senior Bioinformatics Scientist'},{title:'Nursery Teacher'},{description:full+'\nEssential\nHCPC registration required.'},{description:full+'\nEssential\nPhD in biology required.'}])assert.equal(assess(job(extra)).category,'Filtered');
});
test('masters is not inferred from postgraduate training',()=>assert.equal(assess(job({description:full+'\nEssential\nMSc in biology required.'})).category,'Filtered'));
test('desirable PhD does not become a qualification barrier',()=>assert.notEqual(assess(job({description:full+'\nDesirable\nPhD in biology preferred.'})).category,'Filtered'));
test('generic experience wording cannot promote a role to complete',()=>assert.notEqual(assess(job({description:full+'\nAbout us\nWe expect 4 years of relevant experience.'})).category,'Complete Hit'));
test('unfamiliar essential skills require review',()=>assert.notEqual(assess(job({description:full+'\nEssential\nExpert knowledge of specialist ArcGIS cartography.'})).category,'Complete Hit'));
test('database familiarity does not imply SQL and managers do not qualify on two-year wording',()=>{
  assert.notEqual(assess(job({description:full+'\nEssential\nPython and SQL skills required.'})).category,'Complete Hit');
  assert.equal(assess(job({title:'Data Product Manager',description:full+'\nOwn the product plan and lead product strategy.\n#LI-MidSenior'})).category,'Filtered');
});
test('remote without explicit UK eligibility is not eligible',()=>{const a=assess(job({location:'United States',remote_uk:false}));assert.equal(a.category,'Filtered');assert.equal(a.gates.location,false)});
test('misleading TELECOMMUTE metadata and remote residence restrictions do not grant commute eligibility',()=>{
  const page='<script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',title:'Research technician',description:'A laboratory-based research job.',jobLocationType:'TELECOMMUTE',jobLocation:{address:{addressLocality:'London',addressCountry:'UK'}}})+'</script>';
  assert.equal(structuredJobs(page,'https://example.org/1')[0].remote_uk,false);
  assert.equal(job({description:full+'\nApplicants must live within commuting distance of our office.'}).remote_uk,false);
});
test('narrative qualification requirements are essential, including curly apostrophes',()=>assert.equal(assess(job({description:full+'\nAbout you\nYou’ll have a PhD in biology.'})).category,'Filtered'));
test('commute gates distinguish unknown, within limit, borderline and stale routes',()=>{
  const base={remote_uk:false,work_pattern:'Hybrid'},commute={origin:TEST_PROFILE.origin_routing,destination:'E14 5AB',minutes:29,method:'tfl',expires_at:'2099-01-01'};
  assert.notEqual(assess(job(base)).category,'Complete Hit');
  assert.equal(assess(job({...base,commute})).category,'Complete Hit');
  assert.equal(assess(job({...base,commute:{...commute,minutes:40}})).category,'Borderline');
  assert.equal(assess(job({...base,commute:{...commute,origin:'other'}})).gates.location,false);
  assert.equal(assess(job({...base,commute:{...commute,expires_at:'2000-01-01'}})).gates.location,false);
});
test('minimum salary needs annual GBP evidence',()=>{
  assert.notEqual(assess(job({salary:'£20 per hour'}),{minimum_salary:30000}).category,'Complete Hit');
  assert.notEqual(assess(job({salary:'£28,000 to £40,000 per annum'}),{minimum_salary:30000}).category,'Complete Hit');
});
test('plant and child-data roles classify deliberately',()=>{
  assert.equal(classifyFamily(job({title:'Plant Science Research Assistant'})),'Plant & agriculture');
  assert.equal(classifyFamily(job({title:'Child Health Statistics Analyst'})),'Child & population research');
  assert.notEqual(classifyFamily(job({title:'Software Consultant',description:'Technology consulting in Budapest.'})),'Plant & agriculture');
});
test('feedback cannot override qualification gates',()=>assert.equal(assess(job({description:full+'\nEssential\nPhD required.'}),{weights:{research:999}}).category,'Filtered'));
test('unknown and expired closing dates are not invented',()=>{assert.equal(dateOnly('2026-02-31'),'');assert.equal(dateOnly('not a date'),'');assert.equal(assess(job({closing_date:'2001-01-01'})).category,'Filtered')});
test('canonical URL removes tracking but retains vacancy identifiers',()=>{
  assert.equal(canonical('https://example.org/job?id=123&utm_source=linkedin#apply'),'https://example.org/job?id=123');
  assert.equal(canonical('javascript:alert(1)'),'');
});
test('duplicate URLs and employer/title/location combine sources',t=>{
  const s=db(t),a=s.ingest(job());assert.equal(a.isNew,true);
  assert.equal(s.ingest(job({url:'https://example.org/jobs/42?utm_source=x',source:'Aggregator'})).isNew,false);
  const b=s.ingest(job({url:'https://employer.org/42',source:'Employer',direct:true}));assert.equal(b.isNew,false);assert.equal(s.jobs().length,1);assert.equal(s.job(a.id).url,'https://employer.org/42');assert.equal(s.job(a.id).links.length,2);
});
test('distinct references and locations are not overmerged',t=>{const s=db(t);s.ingest(job({reference:'A'}));s.ingest(job({reference:'B',url:'https://example.org/jobs/43'}));s.ingest(job({location:'Cambridge',url:'https://example.org/jobs/44'}));assert.equal(s.jobs().length,3)});
test('application fields, history, notes and saved jobs persist after restart',t=>{
  const s=db(t),r=s.ingest(job());s.updateJob(r.id,{saved:true});
  const record={status:'Applied',notes:'Prepare dataset example',application_date:'2026-09-20',closing_date:'2026-09-30',interview_date:'2026-10-02',salary:'£35,000',contact:'Hiring team',application_url:'https://example.org/apply',cv_version:'science-v3',cover_letter_status:'Submitted',follow_up_date:'2026-10-05'};
  s.application(r.id,record);s.close();const reopened=new Store(s.dir);try{const result=reopened.job(r.id);for(const [key,val]of Object.entries(record))assert.equal(result.application[key],val);assert.equal(result.saved,true);assert.equal(reopened.db.prepare('SELECT count(*) AS n FROM application_events').get().n,1)}finally{reopened.close()}
});
test('housekeeping uses closing date strictly earlier than yesterday and protects applications',t=>{
  const s=db(t),at=new Date('2026-09-21T12:00:00Z');
  const a=s.ingest(job({closing_date:'2026-09-19',reference:'a'}));
  const b=s.ingest(job({closing_date:'2026-09-20',url:'https://example.org/b',reference:'b'}));
  const c=s.ingest(job({closing_date:'2026-09-19',url:'https://example.org/c',reference:'c'}));
  const d=s.ingest(job({closing_date:'2026-09-19',url:'https://example.org/d',reference:'d'}));
  s.application(c.id,{status:'Applied'});s.application(d.id,{status:'Interview'});assert.equal(s.housekeeping(at),1);
  assert.equal(s.job(a.id).archive_reason,'Expired / Not Applied');assert.equal(s.job(b.id).archived,false);assert.equal(s.job(c.id).archived,false);assert.equal(s.job(d.id).archived,false);
  s.updateJob(a.id,{archived:false});assert.equal(s.housekeeping(at),0);assert.equal(s.job(a.id).archived,false);
});
test('every application status is accepted and prior Applied remains protected',t=>{const s=db(t),r=s.ingest(job({closing_date:'2001-01-01'}));for(const status of ['Interested','Preparing','Applied','Interview','Assessment','Offer','Rejected','Withdrawn'])s.application(r.id,{status});s.housekeeping();assert.equal(s.job(r.id).archived,false);assert.throws(()=>s.application(r.id,{status:'invalid'}))});
test('SQLite backup is consistent and restores into another process-ready database',async t=>{const s=db(t),r=s.ingest(job());s.application(r.id,{status:'Applied',notes:'backup persists'});const dest=path.join(s.dir,'backup.sqlite');await s.backup(dest);const restore=path.join(s.dir,'restore');fs.mkdirSync(restore);fs.copyFileSync(dest,path.join(restore,'fieldwork.sqlite'));const recovered=new Store(restore);assert.equal(recovered.job(r.id).application.notes,'backup persists');recovered.close()});
test('search lease prevents concurrent work and recovers from expired lease',t=>{const s=db(t),other=new Store(s.dir);try{assert.equal(s.acquire('a'),true);assert.equal(other.acquire('b'),false);s.db.exec("UPDATE leases SET expires_at='2000-01-01'");assert.equal(other.acquire('b'),true);s.release('a');assert.equal(s.busy(),true);other.release('b');assert.equal(s.busy(),false)}finally{other.close()}});
test('failed source does not stop successful source and log preserves failure reasons',async t=>{
  const s=db(t);for(const x of s.sources())s.putSource({...x,enabled:false});s.putSource({id:'fail',name:'Fail',enabled:true,interval_hours:24});s.putSource({id:'ok',name:'OK',enabled:true,interval_hours:24});
  const r=await search(s,{force:true,adapter:async source=>{if(source.id==='fail')throw Error('HTTP 503');return {jobs:[job()],warnings:[]}}});
  assert.equal(r.status,'partial');assert.equal(r.failed,1);assert.equal(r.checked,1);assert.equal(r.new_jobs,1);assert.equal(s.sources().find(x=>x.id==='fail').health.status,'failed');assert.match(s.sources().find(x=>x.id==='fail').health.warnings[0],/503/);
});
test('manual and unconfigured sources are never counted as successful',async t=>{const s=db(t);for(const x of s.sources())s.putSource({...x,enabled:false});s.putSource({id:'manual-test',name:'Manual',enabled:true,interval_hours:24});const r=await search(s,{force:true,adapter:async()=>({jobs:[],manual:true,warnings:['Manual only']})});assert.equal(r.checked,0);assert.equal(r.status,'no_automatic_sources')});
test('startup catch-up, paused schedule, future due time and daily housekeeping',async t=>{
 const s=db(t);for(const x of s.sources())s.putSource({...x,enabled:false});s.putSource({id:'scheduled-test',name:'Scheduled',type:'rss',enabled:true,interval_hours:24});let calls=[];
 const run=async(_,o)=>calls.push(o.trigger);await tick(s,{startup:true,run});assert.deepEqual(calls,['startup catch-up']);
 s.saveSettings({catch_up:false});await tick(s,{startup:true,run});assert.equal(calls.length,1);
 s.saveSettings({auto_search:false});await tick(s,{run});assert.equal(calls.length,1);
 s.saveSettings({auto_search:true});s.db.exec("UPDATE sources SET next_due='2099-12-31' WHERE id='scheduled-test'");await tick(s,{run});assert.equal(calls.length,1);
 assert.equal(s.settings().last_housekeeping,londonDate());
});
test('NHS XML and JSON-LD produce common schema',()=>{
  const p=parseNHS('<nhsJobs><vacancyDetails><title>Research Assistant</title><employer>NHS</employer><url>https://beta.jobs.nhs.uk/candidate/jobadvert/A-1</url><locations><location>London, E1 1AA</location></locations></vacancyDetails><totalPages>1</totalPages><totalResults>1</totalResults></nhsJobs>');assert.equal(p.jobs[0].location,'London, E1 1AA');assert.match(p.jobs[0].url,/www.jobs.nhs/);
  const page='<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'JobPosting',title:'Plant researcher',hiringOrganization:{name:'Kew'},jobLocation:{address:{addressLocality:'London',postalCode:'TW9 3AE',addressCountry:'UK'}}}]})+'</script>';const j=structuredJobs(page,'https://example.org/1')[0];assert.equal(j.title,'Plant researcher');assert.equal(j.workplace,'TW9 3AE');
});
test('network checks reject private hosts and respect robots paths',()=>{assert.equal(isPrivate('127.0.0.1'),true);assert.equal(isPrivate('192.168.1.2'),true);assert.equal(isPrivate('1.1.1.1'),false);assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public','/private/a'),false);assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public','/private/public/1'),true)});
