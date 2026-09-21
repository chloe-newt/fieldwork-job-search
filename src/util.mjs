import { createHash } from 'node:crypto';
export const now = () => new Date().toISOString();
export const londonDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London', year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function dateOnly(s) {
  if (!s) return '';
  const iso=String(s).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) { const d=new Date(iso+'T12:00:00Z'); return Number.isNaN(+d)||d.toISOString().slice(0,10)!==iso?'':iso; }
  const d=new Date(s);return Number.isNaN(+d)?'':d.toISOString().slice(0,10);
}
export function text(html = '') {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<\/?(?:p|div|h[1-6]|li|ul|br|section|tr)[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|pound|ndash|mdash);/g, x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&pound;':'£','&ndash;':'–','&mdash;':'—'}[x]))
    .replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n;return v>0&&v<=0x10ffff?String.fromCodePoint(v):''})
    .replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
}
export function canonical(raw) {
  try { const u=new URL(raw);if(!['https:','http:'].includes(u.protocol))return '';u.hash='';
    for(const k of [...u.searchParams.keys()])if(/^(utm_|gh_src|lever-source|source$|referrer$|tracking|trk$|keyword$|location$|language$|sort$|country$)/i.test(k))u.searchParams.delete(k);
    u.searchParams.sort();u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\/$/,'');
  }catch{return ''}
}
export const normal = s => String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
export const hash = s => createHash('sha256').update(s).digest('hex').slice(0,24);
export function similarity(a,b) {
  const aa=new Set(normal(a).split(' ')), bb=new Set(normal(b).split(' '));
  return [...aa].filter(x=>bb.has(x)).length / new Set([...aa,...bb]).size;
}
export function salaryInfo(s) {
  const raw=String(s||''); if(!/£|GBP/i.test(raw)||/hour|day|session/i.test(raw))return {salary_min:null,salary_max:null};
  const nums=[...raw.matchAll(/(?:£|GBP\s*)?([\d,]+(?:\.\d+)?)\s*(k)?/gi)].map(m=>Number(m[1].replaceAll(',',''))*(m[2]?1000:1)).filter(n=>n>=10000&&n<500000);
  return {salary_min:nums[0]??null,salary_max:nums[1]??nums[0]??null};
}
export function normalizeJob(j) {
  const description=text(text(j.description||''));
  const title=text(j.title), location=text(j.location||'Location not specified');
  let work_pattern=j.work_pattern||'Unknown';
  if(work_pattern==='Unknown'){
    if(/\bhybrid\b/i.test(location+' '+description))work_pattern='Hybrid';
    else if(/\b(?:fully remote|100% remote|remote[- ]first)\b/i.test(description)||/\bremote\b/i.test(location))work_pattern='Remote';
    else if(/\bon[- ]?site\b/i.test(location+' '+description))work_pattern='On-site';
  }
  let remote_uk=j.remote_uk??(work_pattern==='Remote'&&/\b(?:UK|United Kingdom|Britain|London)\b/i.test(location));
  const remote_restricted=/must (?:live|reside|be based)|maximum commuting distance|required (?:office|on.site)|required to (?:attend|work from) (?:the )?office/i.test(description);
  if(remote_restricted)remote_uk=false;
  const office=description.match(/(\d)\s*days?\s*(?:per |a |each )?week.{0,30}(?:office|on[- ]site)/i);
  return {...j,title,employer:text(j.employer||'Employer unverified'),description,location,url:canonical(j.url),work_pattern,remote_uk,remote_restricted,
    workplace:text(j.workplace||''),nearest_station:j.nearest_station||'',office_days:j.office_days??(office?+office[1]:null),
    salary:j.salary||'',...salaryInfo(j.salary),...(j.salary_min!=null?{salary_min:+j.salary_min}:{}),closing_date:dateOnly(j.closing_date),posting_date:dateOnly(j.posting_date),
    grade:j.grade||description.match(/\b(?:AA|AO|EO|HEO|SEO|Grade [67])\b/)?.[0]||'',contract_type:String(j.contract_type||'Unknown'),employer_type:String(j.employer_type||'Unknown'),
    source:j.source||'Manual import',reference:String(j.reference||''),verified_open:!!j.verified_open,credible:!!j.credible,
    requirements:j.requirements||{},fetched_at:now()};
}
