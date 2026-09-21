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
export function nhsSearchURL(source,query,page){return 'https://www.jobs.nhs.uk/api/v1/search_xml?'+new URLSearchParams({keyword:query,location:source.location||'London',countryCode:'GB-ENG',distance:'20',limit:'100',externalOnly:'true',page:String(page),sort:'publicationDateDesc',...(source.employer_code?{employerCode:source.employer_code}:{})})}
export function nhsDetails(page){
  const essential=[...page.matchAll(/<li[^>]*id="essential_[^"]+"[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>text(m[1]));
  const desirable=[...page.matchAll(/<li[^>]*id="desirable_[^"]+"[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>text(m[1]));
  const overviewStart=page.indexOf('id="job_overview"'), end=page.indexOf('id="employer_name_details"');
  const content=overviewStart>=0?text(page.slice(page.lastIndexOf('<',overviewStart), end>overviewStart?end:overviewStart+35000)):'';
  return {description:content,requirements:{essential:[...new Set(essential)],desirable:[...new Set(desirable)]},workplace:element(page,'employer_postcode'),closing_date:element(page,'closing_date').replace(/Closing date:\s*/i,''),posting_date:element(page,'date_posted')};
}
export async function importURL(url){const page=await html(url);if(/jobs\.nhs\.uk/.test(new URL(url).hostname)){
    const d=nhsDetails(page);return {title:text(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]),employer:element(page,'employer_name'),location:[element(page,'employer_town'),element(page,'employer_postcode')].filter(Boolean).join(', '),salary:element(page,'range_salary'),url,source:'NHS Jobs',credible:true,verified_open:!!page.match(/id="apply(?:-ats-direct)?"/),direct:true,...d};
  }
  const jobs=structuredJobs(page,url);if(!jobs.length)throw Error('No structured JobPosting found. Paste the full advert instead.');
  if(new URL(url).hostname==='www.kcl.ac.uk'){
    const main=page.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
    if(main)jobs[0].description=text(main);
    jobs[0].verified_open=/data-test-id="apply-button-main"/.test(page);
    jobs[0].employer="King's College London";jobs[0].credible=true;jobs[0].direct=true;
  }
  return {...jobs[0],source:new URL(url).hostname};
}
const relevantTitle=t=>/research|science|scientist|analyst|data|bioinformatic|regulat|plant|crop|agricultur|environment|ecolog|laboratory|technician|evidence|statistic|machine learning|software|clinical/i.test(t);
export async function fetchSource(source,settings,{query='',request=get,readPage=html}={}){
  const jobs=[],warnings=[];let limited=false,scanned=0,scopeFiltered=0;const q=query||source.query||'';
  const push=j=>{scanned++;const overseas=/\b(?:United States|USA|Canada|Germany|Switzerland|France|Australia|India|China|Netherlands|Ireland|Spain|Portugal|Italy|Poland|Japan|Singapore|New York|California|Boston|Toronto|Berlin|Dublin)\b/i.test(j.location||'')&&!/\b(?:UK|United Kingdom|London)\b/i.test(j.location||'');if(!relevantTitle(j.title)||overseas&&!j.remote_uk){scopeFiltered++;return}jobs.push(normalizeJob({...j,source:source.name,employer_type:source.employer_type||'Unknown',credible:!!source.credible}))};
  if(source.type==='manual')return {jobs,warnings:[source.note||'Manual source — open in browser and import advert'],manual:true};
  if(source.type==='ashby'){
    const data=await request(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.board)}?includeCompensation=true`,{json:true});
    if(!Array.isArray(data.jobs))throw Error('Unexpected Ashby schema');
    for(const j of data.jobs){
      if(j.isListed===false)continue;
      const address=j.address?.postalAddress||{},secondary=j.secondaryLocations||[];
      const location=[j.location,address.addressCountry,...secondary.flatMap(x=>[x.location,x.address?.addressCountry])].filter(Boolean).join(' / ');
      const work_pattern=({Remote:'Remote',Hybrid:'Hybrid',OnSite:'On-site'})[j.workplaceType]||(j.isRemote?'Remote':'Unknown');
      const uk=/\b(?:UK|GB|GBR|United Kingdom|London)\b/i.test(location);
      push({title:j.title,employer:source.name,location,description:j.descriptionPlain||j.descriptionHtml,url:j.jobUrl||j.applyUrl,reference:j.id||j.jobUrl,
        posting_date:j.publishedAt,contract_type:j.employmentType,work_pattern,remote_uk:work_pattern==='Remote'&&uk,
        salary:j.compensation?.compensationTierSummary||j.compensation?.scrapeableCompensationSalarySummary||'',
        workplace:uk&&/\b(?:UK|GB|GBR|United Kingdom)\b/i.test(address.addressCountry||'')?address.postalCode||'':'',verified_open:true,direct:true});
    }
  }else if(source.type==='greenhouse'){
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
    const maxPages=Math.min(20,Math.max(1,source.max_pages||10)),feedJobs=[];let details=0;
    for(let page=1;page<=maxPages;page++){
      const data=parseNHS(await request(nhsSearchURL(source,q,page)));
      feedJobs.push(...data.jobs);
      if(page>=data.pages)break;if(page===maxPages)limited=true;
    }
    const terms=q.toLowerCase().match(/[a-z]+/g)||[];
    const priority=j=>terms.reduce((n,w)=>n+(j.title.toLowerCase().includes(w)?5:0),0)+(/graduate|junior|research assistant|trainee/i.test(j.title)?3:0)-(/nurse|midwi|clinical fellow|consultant|senior|principal|head of/i.test(j.title)?5:0);
    feedJobs.sort((a,b)=>priority(b)-priority(a));
    for(const j of feedJobs){if(relevantTitle(j.title)){
      if(details<60){details++;try{Object.assign(j,Object.fromEntries(Object.entries(nhsDetails(await request(j.url))).filter(([,v])=>v!=='')))}catch(e){warnings.push(`${j.title}: full requirements unavailable (${e.message})`)}}
      else limited=true;
    }push(j)}
    if(limited)warnings.push(`Bounded NHS scan: up to ${maxPages*100} feed records and 60 full adverts per query. Title-relevant results are prioritised for full details.`);
  }else if(source.type==='academic'){
    const url='https://www.jobs.ac.uk/search/?'+new URLSearchParams({keywords:q,sortOrder:'1',pageSize:'25',...(source.location?{location:source.location}:{})});
    const page=await readPage(url), links=[...new Set([...page.matchAll(/href="(\/job\/[^"#]+)"/g)].map(m=>'https://www.jobs.ac.uk'+m[1]))];
    if(!links.length&&!/no (?:jobs|results)|0 jobs|no matching/i.test(page))throw Error('No vacancy links recognised; source layout may have changed');
    for(const link of links.slice(0,25))try{const detail=await readPage(link), parsed=structuredJobs(detail,link);if(!parsed.length)throw Error('JobPosting metadata missing');for(const j of parsed){j.url=link;push(j)}}catch(e){warnings.push(`${link}: ${e.message}`)}
    limited=links.length>25||/next page|rel="next"/i.test(page);
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
  return {jobs,warnings,limited,scanned,scope_filtered:scopeFiltered};
}
