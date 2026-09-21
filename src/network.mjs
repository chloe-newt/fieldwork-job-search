import dns from 'node:dns/promises';
import net from 'node:net';
const robotCache=new Map();
const lastRequest=new Map();
export function isPrivate(ip){
  if(net.isIPv6(ip))return /^(?:::|fc|fd|fe[89ab])/i.test(ip)||ip.toLowerCase().startsWith('::ffff:');
  const [a,b]=ip.split('.').map(Number);
  return a===0||a===10||a===127||a>=224||a===169&&b===254||a===192&&[0,168].includes(b)||a===172&&b>=16&&b<=31||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b);
}
export async function publicURL(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw Error('Use a public HTTPS URL');
  if(u.hostname==='localhost'||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))throw Error('Local network URLs are not allowed');
  const addresses=await dns.lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(x=>isPrivate(x.address)))throw Error('Private network URLs are not allowed');return u;
}
export async function get(raw,{json=false,headers={},timeout=18000}={}){
  let url=raw;for(let i=0;i<5;i++){
    const target=await publicURL(url);const delay=Math.max(0,250-(Date.now()-(lastRequest.get(target.origin)||0)));if(delay)await new Promise(r=>setTimeout(r,delay));lastRequest.set(target.origin,Date.now());
    const response=await fetch(url,{headers:{'User-Agent':'FieldworkLocal/1.0 (personal vacancy reader)','Accept':json?'application/json':'text/html, application/xml;q=0.9, */*;q=0.5',...headers},redirect:'manual',signal:AbortSignal.timeout(timeout)});
    if([301,302,303,307,308].includes(response.status)){const next=new URL(response.headers.get('location'),url);if(next.origin!==target.origin)headers={};url=next.href;continue;}
    if(!response.ok)throw Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    let length=0;const chunks=[];for await(const chunk of response.body){length+=chunk.length;if(length>8_000_000)throw Error('Source response exceeds 8 MB');chunks.push(chunk)}
    const body=Buffer.concat(chunks).toString('utf8');if(!json&&/Quick Check Needed|cf-chl-|id="captcha-form"|verify you are human|unusual traffic/i.test(body))throw Error('Source requires human verification; use browser search and text import');
    return json?JSON.parse(body):body;
  }throw Error('Too many redirects');
}
export function robotsAllowed(body,path){
  if(/<html/i.test(body))return true;
  const groups=[];let group=null,hasRules=false;
  for(const raw of body.split('\n')){const line=raw.split('#')[0].trim(),m=line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);if(!m)continue;
    if(m[1].toLowerCase()==='user-agent'){if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false}group.agents.push(m[2].toLowerCase());}
    else if(group){group.rules.push({allow:m[1].toLowerCase()==='allow',path:m[2]});hasRules=true;}
  }
  const specific=groups.filter(g=>g.agents.some(a=>a.includes('fieldwork'))), selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const matches=selected.flatMap(g=>g.rules).filter(r=>r.path&&new RegExp('^'+r.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$')).test(path)).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
  return !matches.length||matches[0].allow;
}
export async function html(raw){
  const u=await publicURL(raw);
  if(/(^|\.)(linkedin\.com|indeed\.com|glassdoor\.[a-z.]+)$/i.test(u.hostname))throw Error('This platform uses browser search and pasted text import; automated retrieval is disabled');
  let robots=robotCache.get(u.origin);
  if(!robots||robots.expires<Date.now()){
    let body='';try{body=await get(u.origin+'/robots.txt')}catch(e){if(!/HTTP 404|HTTP 410/.test(e.message))throw Error(`Cannot check robots.txt: ${e.message}`)}
    robots={body,expires:Date.now()+86400000};robotCache.set(u.origin,robots);
  }
  if(!robotsAllowed(robots.body,u.pathname+u.search))throw Error('robots.txt disallows this page; use pasted text import');
  return get(u.href);
}
