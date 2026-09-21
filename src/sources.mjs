import {get,html} from './network.mjs';
import {text,canonical,normalizeJob} from './util.mjs';
import {QUERIES} from './defaults.mjs';
export const tag=(s,name)=>text(s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1]||'');
const tags=(s,name)=>[...s.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'gi'))].map(x=>text(x[1]));
function element(s,id){const m=s.match(new RegExp(`<([a-z0-9]+)[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,'i'));return text(m?.[2]||'')}
export function structuredJobs(page,url){
  const nodes=[];function walk(v){if(Array.isArray(v))return v.forEach(walk);if(!v||typeof v!=='object')return;if([v['@type']].flat().includes('JobPosting'))nodes.push(v);if(v['@graph'])walk(v['@graph']);if(v.itemListElement)walk(v.itemListElement);if(v.item)walk(v.item);}
  for(const m of page.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{walk(JSON.parse(m[1]))}catch{try{walk(JSON.parse(m[1].replace(/\\\\"/g,'\\"')))}catch{}}
  }
  return nodes.map(j=>{
    const addresses=[j.jobLocation].flat().filter(Boolean).map(x=>x.address||{});
    const location=addresses.map(a=>[a.streetAddress,a.addressLocality,a.addressRegion,a.postalCode,typeof a.addressCountry==='object'?a.addressCountry.name:a.addressCountry].filter(Boolean).join(', ')).join(' / ');
    const v=j.baseSalary?.value, currency=j.baseSalary?.currency;
    const salary=v?`${currency==='GBP'?'£':currency||''}${v.minValue||v.value||''}${v.maxValue?' – '+v.maxValue:''} ${v.unitText||''}`:'';
    const explicitRemote=/\bfully remote|\b100% remote|remote[- ]first|this (?:role|position) is remote/i.test(text(j.description))||/\bremote\b/i.test(location);
    return {title:j.title,employer:j.hiringOrganization?.name,description:j.description,location:location||j.applicantLocationRequirements?.name||'',workplace:addresses[0]?.postalCode||addresses[0]?.streetAddress||'',
      url:j.url||url,posting_date:j.datePosted,closing_date:j.validThrough,reference:j.identifier?.value||'',salary,contract_type:j.employmentType,
      work_pattern:j.jobLocationType==='TELECOMMUTE'&&explicitRemote?'Remote':'Unknown',remote_uk:j.jobLocationType==='TELECOMMUTE'&&explicitRemote&&/United Kingdom|UK/i.test(JSON.stringify(j.applicantLocationRequirements||addresses)),verified_open:true};
  });
}
export function parseNHS(xml){if(!/<nhsJobs\b/.test(xml))throw Error('NHS XML schema changed');return {pages:+tag(xml,'totalPages'),total:+tag(xml,'totalResults'),jobs:[...xml.matchAll(/<vacancyDetails>([\s\S]*?)<\/vacancyDetails>/g)].map(([,b])=>({
  title:tag(b,'title'),employer:tag(b,'employer'),description:tag(b,'description'),closing_date:tag(b,'closeDate'),posting_date:tag(b,'postDate'),salary:tag(b,'salary'),contract_type:tag(b,'type'),reference:tag(b,'reference'),location:tags(b,'location').join(' / '),url:tag(b,'url').replace('beta.jobs.nhs.uk','www.jobs.nhs.uk'),verified_open:true,direct:true
}))}}
export function nhsDetails(page){
  const essential=[...page.matchAll(/<li[^>]*id="essential_[^"]+"[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>text(m[1]));
  const desirable=[...page.matchAll(/<li[^>]*id="desirable_[^"]+"[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>text(m[1]));
  const overviewStart=page.indexOf('id="job_overview"'), end=page.indexOf('id="employer_name_details"');
  const content=overviewStart>=0?text(page.slice(page.lastIndexOf('<',overviewStart), end>overviewStart?end:overviewStart+35000)):'';
  return {description:content,requirements:{essential:[...new Set(essential)],desirable:[...new Set(desirable)]},workplace:element(page,'employer_postcode'),closing_date:element(page,'closing_date').replace(/Closing date:\s*/i,''),posting_date:element(page,'date_posted')};
}
export async function importURL(url){const page=await html(url);if(/jobs\.nhs\.uk/.test(new URL(url).hostname)){
    const d=nhsDetails(page);return {title:text(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]),employer:element(page,'employer_name'),location:[element(page,'employer_town'),element(page,'employer_postcode')].filter(Boolean).join(', '),salary:element(page,'range_salary'),url,source:'NHS Jobs',credible:true,verified_open:!!page.match(/id="apply"/),direct:true,...d};
  }
  const jobs=structuredJobs(page,url);if(!jobs.length)throw Error('No structured JobPosting found. Paste the full advert instead.');return {...jobs[0],source:new URL(url).hostname};
}
const relevantTitle=t=>/research|science|scientist|analyst|data|bioinformatic|regulat|plant|crop|agricultur|environment|ecolog|laboratory|technician|evidence|statistic|machine learning|software|clinical/i.test(t);
export async function fetchSource(source,settings,{query=''}={}){
  const jobs=[],warnings=[];let limited=false;const q=query||source.query||'';
  const push=j=>jobs.push(normalizeJob({...j,source:source.name,employer_type:source.employer_type||'Unknown',credible:!!source.credible}));
  if(source.type==='manual')return {jobs,warnings:[source.note||'Manual source — open in browser and import advert'],manual:true};
  if(source.type==='greenhouse'){
    const data=await get(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.board)}/jobs?content=true`,{json:true});if(!Array.isArray(data.jobs))throw Error('Unexpected Greenhouse schema');
    for(const j of data.jobs)push({title:j.title,employer:source.name,location:j.location?.name,description:j.content,url:j.absolute_url,reference:String(j.id),posting_date:j.first_published,verified_open:true,direct:true});
  }else if(source.type==='lever'){
    let offset=0;for(let page=0;page<12;page++){
      const data=await get(`https://api${source.region==='eu'?'.eu':''}.lever.co/v0/postings/${encodeURIComponent(source.board)}?mode=json&limit=100&skip=${offset}`,{json:true});if(!Array.isArray(data))throw Error('Unexpected Lever schema');
      for(const j of data)push({title:j.text,employer:source.name,location:[j.categories?.location,...(j.categories?.allLocations||[])].filter(Boolean).join('; '),description:[j.descriptionPlain,...(j.lists||[]).map(x=>x.text+'\n'+text(x.content)),j.additionalPlain].join('\n'),url:j.hostedUrl||j.applyUrl,reference:j.id,posting_date:j.createdAt?new Date(j.createdAt).toISOString():'',contract_type:j.categories?.commitment,work_pattern:({remote:'Remote',hybrid:'Hybrid','on-site':'On-site'})[j.workplaceType],verified_open:true,direct:true});
      if(data.length<100)break;offset+=100;if(page===11)limited=true;
    }
  }else if(source.type==='smartrecruiters'){
    let offset=0;for(let page=0;page<3;page++){
      const d=await get(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.board)}/postings?country=gb&limit=100&offset=${offset}`,{json:true});if(!Array.isArray(d.content))throw Error('Unexpected SmartRecruiters schema');
      for(const j of d.content){let desc='';if(relevantTitle(j.name))try{const detail=await get(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.board)}/postings/${j.id}`,{json:true});desc=Object.values(detail.jobAd?.sections||{}).map(s=>s.title+'\n'+s.text).join('\n')}catch(e){warnings.push(`${j.name}: ${e.message}`)}
        push({title:j.name,employer:j.company?.name||source.name,location:[j.location?.city,j.location?.country].filter(Boolean).join(', '),description:desc,reference:j.refNumber||j.id,url:`https://jobs.smartrecruiters.com/${encodeURIComponent(source.board)}/${j.id}`,posting_date:j.releasedDate,work_pattern:j.location?.remote?'Remote':'Unknown',remote_uk:!!j.location?.remote,verified_open:true,direct:true});}
      if(offset+100>=d.totalFound)break;offset+=100;if(page===2)limited=true;
    }
  }else if(source.type==='nhs'){
    for(let page=1;page<=3;page++){
      const params=new URLSearchParams({keyword:q,location:'London',distance:'20',externalOnly:'true',page:String(page),sort:'publicationDateDesc',...(source.employer_code?{employerCode:source.employer_code}:{})});
      const data=parseNHS(await get('https://www.jobs.nhs.uk/api/v1/search_xml?'+params));
      for(const j of data.jobs){if(relevantTitle(j.title))try{Object.assign(j,Object.fromEntries(Object.entries(nhsDetails(await get(j.url))).filter(([,v])=>v!=='')))}catch(e){warnings.push(`${j.title}: full requirements unavailable (${e.message})`)}push(j)}
      if(page>=data.pages)break;if(page===3)limited=true;
    }
  }else if(source.type==='academic'){
    const url='https://www.jobs.ac.uk/search/?'+new URLSearchParams({keywords:q,sortOrder:'1',pageSize:'25'});
    const page=await html(url), links=[...new Set([...page.matchAll(/href="(\/job\/[^"#]+)"/g)].map(m=>'https://www.jobs.ac.uk'+m[1]))];
    if(!links.length&&!/no (?:jobs|results)|0 jobs|no matching/i.test(page))throw Error('No vacancy links recognised; source layout may have changed');
    for(const link of links.slice(0,15))try{const detail=await html(link), parsed=structuredJobs(detail,link);if(!parsed.length)throw Error('JobPosting metadata missing');for(const j of parsed){j.url=link;push(j)}}catch(e){warnings.push(`${link}: ${e.message}`)}
    limited=links.length>15||/next page|rel="next"/i.test(page);
  }else if(source.type==='rss'){
    const xml=await get(source.url);if(!/<rss|<feed/i.test(xml))throw Error('Not an RSS / Atom feed');
    for(const m of xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)){
      const b=m[1],url=tag(b,'link')||b.match(/<link[^>]+href=["']([^"']+)/)?.[1];
      push({title:tag(b,'title'),employer:source.employer||'',location:source.location||'',description:tag(b,'description')||tag(b,'content'),url,posting_date:tag(b,'pubDate')||tag(b,'published'),verified_open:false});
    }
  }else if(source.type==='jsonld'){
    if(!source.permission_confirmed)throw Error('Confirm permission for automated employer-page retrieval when adding the source');
    const page=await html(source.url),parsed=structuredJobs(page,source.url);if(!parsed.length)throw Error('No JobPosting metadata on employer page');for(const j of parsed)push({...j,direct:true});
  }else if(source.type==='brave'){
    if(!settings.brave_key)return {jobs,warnings:['Needs an optional Brave Search API key. Browser search links and advert import work without a key.'],unconfigured:true};
    const searches=query?[query+' jobs UK London']:[...QUERIES.map(q=>q+' jobs London UK graduate'), 'site:civilservicejobs.service.gov.uk (Defra OR APHA OR MHRA OR ONS OR UKHSA OR DSIT OR DESNZ) (science OR research OR evidence OR analyst)'];
    const seen=new Set();for(const term of searches){const d=await get('https://api.search.brave.com/res/v1/web/search?'+new URLSearchParams({q:term,count:'10'}),{json:true,headers:{'X-Subscription-Token':settings.brave_key}});
      for(const r of d.web?.results||[]){if(seen.has(r.url))continue;seen.add(r.url);try{const j=await importURL(r.url);push(j)}catch(e){warnings.push(`${new URL(r.url).hostname}: ${e.message}`);if(/civilservicejobs\.service\.gov\.uk\/csr\/jobs\.cgi/.test(r.url))push({title:r.title,employer:'Civil Service (verify department)',description:text(r.description),location:'Location not specified',url:r.url,verified_open:false});}}
    }
  }else throw Error('Unsupported source type');
  if(query&&!['nhs','academic','brave'].includes(source.type)){const words=query.toLowerCase().split(/\s+/);return {jobs:jobs.filter(j=>words.every(w=>(j.title+' '+j.description).toLowerCase().includes(w))),warnings,limited};}
  return {jobs,warnings,limited};
}
