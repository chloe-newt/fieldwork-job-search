import {canonical,text} from './util.mjs';

// Parsing is deliberately local and deterministic. Never fetch an Indeed URL,
// infer that a pasted listing is still open, or guess employer/country evidence.
export function advertDraft({url='',description='',source='Manual import'}={}){
  const cleanURL=canonical(url);
  if(!cleanURL)throw Error('Paste a valid vacancy URL');
  if(typeof description!=='string'||description.trim().length<30)throw Error('Paste the full advert, including its requirements');
  const content=text(description.slice(0,200000));
  const lines=content.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const labelled=label=>lines.map(s=>s.match(new RegExp('^(?:'+label+')\\s*:\\s*(.+)$','i'))?.[1]).find(Boolean)||'';
  const indeed=/(^|\.)indeed\.(?:com|co\.uk)$/.test(new URL(cleanURL).hostname);
  const title=labelled('Job title|Title')||'';
  const employer=labelled('Company|Employer')||'';
  const location=labelled('Location|Job location')||'';
  const salary=labelled('Salary|Pay')||lines.find(s=>/£[\d,]+/.test(s)&&/per (?:year|annum|hour|day)|a year|annual|\bp\.a\./i.test(s))||'';
  return {url:cleanURL,title,employer,location,salary,source:indeed?'Indeed · pasted advert':String(source).slice(0,150),description:content,verified_open:false,credible:false,remote_uk:false,work_pattern:'Unknown',import_method:'pasted_text',reference:indeed?new URL(cleanURL).searchParams.get('jk')||'':''};
}
