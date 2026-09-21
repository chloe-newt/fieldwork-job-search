import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Store} from './src/store.mjs';
import {search,tick} from './src/search.mjs';
import {route} from './src/commute.mjs';
import {importURL} from './src/sources.mjs';
import {canonical,now,dateOnly} from './src/util.mjs';
import {FAMILIES,QUERIES} from './src/defaults.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const logDir=path.join(ROOT,'logs');fs.mkdirSync(logDir,{recursive:true});
const logFile=path.join(logDir,'server.log');
if(fs.existsSync(logFile)&&fs.statSync(logFile).size>5_000_000)fs.renameSync(logFile,path.join(logDir,`server-${Date.now()}.log`));
for(const level of ['log','error']){const original=console[level].bind(console);console[level]=(...args)=>{try{fs.appendFileSync(logFile,`${now()} ${level.toUpperCase()} ${args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')}\n`)}catch{}original(...args)}}
const DATA=path.resolve(process.env.FIELDWORK_DATA_DIR||path.join(ROOT,'data'));
const BACKUPS=path.resolve(process.env.FIELDWORK_BACKUP_DIR||(process.env.FIELDWORK_DATA_DIR?path.join(DATA,'backups'):path.join(ROOT,'backups')));
const port=Number(process.env.FIELDWORK_PORT||4317),store=new Store(DATA);
const csrf=randomBytes(32).toString('hex');
const args=process.argv.slice(2);
if(args.includes('--backup')){
  const dest=path.join(BACKUPS,`fieldwork-${now().replaceAll(':','-')}.sqlite`);await store.backup(dest);console.log(`Backup saved: ${dest}`);store.close();
}else if(args.includes('--search-once')){
  try{
    store.housekeeping();const config=store.settings(),force=args.includes('--force');
    const due=store.sources().some(s=>s.enabled&&s.type!=='manual'&&!(s.type==='brave'&&!config.brave_key)&&s.next_due<=now());
    const r=!config.auto_search&&!force?{status:'paused'}:!due&&!force?{status:'not_due'}:await search(store,{force,trigger:'Windows scheduled task'});
    console.log(JSON.stringify(r));if(r.status==='failed')process.exitCode=2;
  }catch(e){console.error(e.message);process.exitCode=1}finally{store.close()}
}else{
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const body=async req=>{let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>2_000_000)throw Error('Request too large');parts.push(chunk)}try{return JSON.parse(Buffer.concat(parts).toString()||'{}')}catch{throw Error('Invalid JSON')}};
  const server=http.createServer(async(req,res)=>{
    try{
      const allowedHosts=new Set([`localhost:${port}`,`127.0.0.1:${port}`]);if(!allowedHosts.has(req.headers.host)){send(res,403,{error:'Localhost access only'});return;}
      const url=new URL(req.url,`http://127.0.0.1:${port}`),p=url.pathname;
      if(req.method!=='GET'&&req.method!=='HEAD'){
        if(req.headers['x-fieldwork-token']!==csrf||req.headers.origin&&!new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`]).has(req.headers.origin)){send(res,403,{error:'Invalid local session. Reload the page.'});return;}
      }
      if(p==='/api/health'){send(res,200,{app:'fieldwork',version:'1.0.0',status:'ready',pid:process.pid});return;}
      if(p==='/api/activity'&&req.method==='GET'){send(res,200,{busy:store.busy(),run:store.db.prepare('SELECT id,status,finished_at FROM runs ORDER BY id DESC LIMIT 1').get()||null});return;}
      if(p==='/api/state'&&req.method==='GET'){
        const cfg=store.settings(),sources=store.sources();const runs=store.db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 20').all();
        const last=store.db.prepare("SELECT * FROM runs WHERE checked>0 AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").get();
        const complete=store.db.prepare("SELECT * FROM runs WHERE status='success' AND checked>0 ORDER BY id DESC LIMIT 1").get();
        const due=sources.filter(s=>s.enabled&&s.type!=='manual'&&!(s.type==='brave'&&!cfg.brave_key)).map(s=>s.next_due).sort()[0]||null;
        send(res,200,{token:csrf,jobs:store.jobs(),sources,runs,last_success:last||null,last_all_success:complete||null,next_search:cfg.auto_search?due:null,busy:store.busy(),
          settings:{...cfg,brave_key:cfg.brave_key?'configured':'',tfl_key:cfg.tfl_key?'configured':''},families:FAMILIES,queries:QUERIES,data_directory:DATA});return;
      }
      if(p==='/api/search'&&req.method==='POST'){
        const b=await body(req);if(store.busy()){send(res,409,{error:'A search is already running'});return;}
        const promise=search(store,{force:true,query:String(b.query||'').slice(0,300),source_id:String(b.source_id||''),trigger:'manual'});promise.catch(e=>console.error('Search error:',e.message));send(res,202,{started:true});return;
      }
      if(p==='/api/settings'&&req.method==='POST'){
        const b=await body(req),out={};
        const numbers={commute_limit:[1,240],borderline_minutes:[0,120],minimum_salary:[0,500000],max_experience:[0,10]};
        for(const [k,[min,max]] of Object.entries(numbers))if(k in b){const v=Number(b[k]);if(!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${k}`);out[k]=v;}
        for(const k of ['origin','origin_routing','include_keywords','exclude_keywords','profile_summary'])if(k in b)out[k]=String(b[k]).slice(0,5000);
        for(const k of ['brave_key','tfl_key'])if(k in b&&b[k]!=='configured')out[k]=String(b[k]).trim().slice(0,500);
        for(const k of ['auto_search','catch_up','routing_enabled'])if(k in b)out[k]=!!b[k];
        for(const k of ['skills','qualifications','pending_qualifications','certifications','exclude_employers'])if(k in b){if(!Array.isArray(b[k])||b[k].length>100)throw Error(`Invalid ${k}`);out[k]=b[k].map(v=>String(v).trim().toLowerCase()).filter(Boolean);}
        store.saveSettings(out);store.reassess();send(res,200,{ok:true});return;
      }
      if(p==='/api/sources'&&req.method==='POST'){
        const b=await body(req);const existing=store.sources().find(s=>s.id===b.id);
        const s=existing?{...existing,enabled:!!b.enabled,interval_hours:Number(b.interval_hours||existing.interval_hours)}:{id:'custom-'+randomBytes(5).toString('hex'),name:String(b.name||'').slice(0,150),type:b.type,board:String(b.board||'').trim(),url:canonical(b.url),employer:String(b.employer||''),location:String(b.location||''),interval_hours:Number(b.interval_hours||48),enabled:true,credible:!!b.credible,permission_confirmed:!!b.permission_confirmed,employer_type:b.employer_type||'Unknown'};
        if(!s.name||!['greenhouse','lever','smartrecruiters','rss','jsonld','manual','nhs','academic','brave'].includes(s.type))throw Error('Invalid source');
        if(!Number.isFinite(s.interval_hours)||s.interval_hours<1||s.interval_hours>720)throw Error('Source interval must be 1–720 hours');
        if(['greenhouse','lever','smartrecruiters'].includes(s.type)&&!/^[a-zA-Z0-9_-]{1,100}$/.test(s.board))throw Error('Enter the employer board identifier, not a full URL');
        if(['rss','jsonld'].includes(s.type)&&!s.url.startsWith('https://'))throw Error('Use a public HTTPS source URL');
        delete s.health;delete s.next_due;store.putSource(s);send(res,200,{ok:true});return;
      }
      if(p==='/api/import-url'&&req.method==='POST'){const b=await body(req);const job=await importURL(String(b.url));send(res,200,{job});return;}
      if(p==='/api/jobs'&&req.method==='POST'){
        const b=await body(req);if(!b.title||!b.employer||!b.url)throw Error('Title, employer and application URL are required');
        b.description=String(b.description||'').slice(0,200000);if(b.closing_date&&!dateOnly(b.closing_date))throw Error('Invalid closing date');
        delete b.assessment;delete b.commute;delete b.fetched_at;send(res,201,store.ingest(b));return;
      }
      const match=p.match(/^\/api\/jobs\/(\d+)(?:\/(application|feedback|commute))?$/);
      if(match&&req.method==='POST'){
        const id=+match[1],action=match[2],b=await body(req);let j=store.job(id);if(!j){send(res,404,{error:'Job not found'});return;}
        if(action==='application')j=store.application(id,b);
        else if(action==='feedback')j=store.feedback(id,b.value);
        else if(action==='commute'){
          store.updateJob(id,{workplace:String(b.workplace||j.workplace),nearest_station:String(b.nearest_station||j.nearest_station)});j=store.job(id);
          const minutes=b.minutes==null||b.minutes===''?null:Number(b.minutes);
          if(b.manual){if(!Number.isFinite(minutes)||minutes<0||minutes>1440||!j.workplace&&!j.nearest_station)throw Error('Provide a destination and a valid estimate in minutes');
            j=store.updateJob(id,{commute:{minutes,method:'manual',origin:store.settings().origin_routing,destination:j.workplace||j.nearest_station,checked_at:now(),expires_at:new Date(Date.now()+30*86400000).toISOString(),note:'User-entered estimate; not a live transport route'}});
          }else j=store.updateJob(id,{commute:await route(store,j,{force:true})});
        }else {const delta={};for(const k of ['saved','hidden','archived','archive_exempt','workplace','nearest_station','review','credible','verified_open','closing_date','office_days','work_pattern','remote_uk','salary','grade'])if(k in b)delta[k]=b[k];j=store.updateJob(id,delta);}
        send(res,200,{job:j});return;
      }
      if(p==='/api/logs'&&req.method==='GET'){
        const logs=store.db.prepare('SELECT l.*,s.config FROM source_logs l LEFT JOIN sources s ON l.source_id=s.id ORDER BY l.id DESC LIMIT 300').all().map(l=>({...l,details:JSON.parse(l.details),source:JSON.parse(l.config||'{}').name||l.source_id,config:undefined}));send(res,200,{logs});return;
      }
      if(p==='/api/backup'&&req.method==='POST'){
        const file=`fieldwork-${now().replaceAll(':','-')}.sqlite`;await store.backup(path.join(BACKUPS,file));send(res,200,{file,url:'/api/download/'+file});return;
      }
      if(p.startsWith('/api/download/')&&req.method==='GET'){
        const name=p.slice('/api/download/'.length);if(!/^fieldwork-[\dTZ.\-]+\.sqlite$/.test(name)){send(res,400,{error:'Invalid backup filename'});return;}
        const file=path.join(BACKUPS,name);if(!fs.existsSync(file)){send(res,404,{error:'Backup not found'});return;}res.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':`attachment; filename="${name}"`});fs.createReadStream(file).pipe(res);return;
      }
      if(p==='/api/export'&&req.method==='GET'){
        const cfg=store.settings();delete cfg.brave_key;delete cfg.tfl_key;
        res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="fieldwork-export.json"','Cache-Control':'no-store'});res.end(JSON.stringify({version:1,exported_at:now(),settings:cfg,sources:store.sources(),jobs:store.jobs(),application_events:store.db.prepare('SELECT * FROM application_events').all()},null,2));return;
      }
      if(p==='/api/shutdown'&&req.method==='POST'){send(res,200,{ok:true});shutdown();return;}
      if(req.method!=='GET'){send(res,405,{error:'Method not allowed'});return;}
      const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
      if(!files[p]){send(res,404,{error:'Not found'});return;}
      const ext=path.extname(files[p]);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[ext],
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(fs.readFileSync(path.join(ROOT,'public',files[p])));
    }catch(e){console.error(e.message);if(!res.headersSent)send(res,400,{error:e.message});else res.end();}
  });
  let timer,stopping=false;
  function shutdown(){if(stopping)return;stopping=true;clearInterval(timer);server.close(()=>{store.close();process.exit(0)});setTimeout(()=>process.exit(0),3000).unref()}
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is already in use. Open http://localhost:${port} or choose FIELDWORK_PORT.`:e);store.close();process.exit(1)});
  server.listen(port,'127.0.0.1',()=>{
    console.log(`Fieldwork is ready at http://localhost:${port}\nLocal database: ${store.file}\nClosing the browser, ChatGPT or Codex will not stop this server.\n`);
    tick(store,{startup:true}).catch(e=>console.error('Startup search:',e.message));
    timer=setInterval(()=>tick(store).catch(e=>console.error('Scheduler:',e.message)),60000);
  });
}
