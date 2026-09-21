import { londonDate, normal } from './util.mjs';
import { DEFAULTS } from './defaults.mjs';

const signals = {
 python:/\bpython\b/i,pandas:/\bpandas\b/i,numpy:/\bnumpy\b/i,statistics:/\bstatistic(?:s|al|ian)?\b/i,
 sql:/\bSQL\b/i,duckdb:/\bDuckDB\b/i,git:/\bgit(?:hub)?\b/i,linux:/\blinux|\bWSL\b/i,
 'data quality':/\bdata (?:quality|cleaning|validation)|quality.assur(?:e|ing|ance).{0,20}data/i,
 'data integration':/\bdata integration|integrat(?:e|ing|ion).{0,30}data|link(?:ing|ed).{0,20}datasets/i,
 dashboards:/\bdashboards?\b|\bshiny\b/i,automation:/\bautomat(?:e|ed|ion)|reproducible (?:workflows?|pipelines?)/i,
 'data analysis':/\bdata (?:analysis|analytics|analyst)\b/i,visualisation:/\bvisuali[sz]ation\b/i,
 'machine learning':/\bmachine learning|\bML\b/,bioinformatics:/\bbioinformatic/i,'computational biology':/\bcomputational biolog/i,
 biology:/\bbiolog(?:y|ical)|life science|biomedical/i,neuroscience:/\bneuro(?:science|scientific)/i,
 research:/\bresearch\b/i,laboratory:/\blaboratory|\blab\b/i,proteomics:/\bproteomic/i,
 'mass spectrometry':/\bmass spectrometr/i,databases:/\bdatabases?\b/i,'scientific computing':/\bscientific (?:computing|programming)|computational workflow/i
};
const familyRules = [
 ['Child & population research',/child(?:ren)?(?:'s)? (?:health|development|data|research|services|aged)|childhood|child-development|adolescent|paediatric|pediatric|youth outcomes|education statistics|developmental neuro/i,/data|statistic|research|evidence|epidemiolog|analys/i],
 ['Plant & agriculture',/\b(?:plant (?:science|biolog|health|patholog|genom)|crops?\b|agricultur|agri[- ]|horticultur|phytopath|pesticid|entomolog|food systems|pest\b|biosecurity|invasive species)/i],
 ['Environmental & regulatory',/environmental (?:science|data|risk|policy)|ecolog|biodiversity|conservation (?:data|science)|regulatory (?:science|affairs|policy)|sustainab|chemical risk|evidence assessment|government science/i],
 ['Biological & biomedical',/biolog|biomed|bioinformatic|genomic|proteomic|neuro|clinical (?:research|trial)|laboratory|mass spectrom/i],
 ['Data & computational',/\bdata\b|statistic|analyst|analytical|software|scientific programm|machine learning|evidence|scientific comput/i]
];
export function classifyFamily(j) {
  const title=j.title||'', all=title+' '+(j.description||'');
  for(const scope of [title,all])for(const [f,re,extra] of familyRules)if(re.test(scope)&&(!extra||extra.test(all)))return f;
  return 'Other';
}
export function extractRequirements(j) {
  const explicit=j.requirements||{};
  let section='unspecified';const out={essential:[],desirable:[],unspecified:[]};
  for(let line of String(j.description||'').split(/\n|(?<=[.!?])\s+/)){
    line=line.trim();if(!line)continue;
    if(/^(?:essential(?: criteria| requirements| skills)?|minimum qualifications|requirements|what you(?:'|’)ll (?:need|bring)|qualifications|person specification|must have|about you)(?:\s*[:|].*)?$/i.test(line)){section='essential';continue;}
    if(/^(?:desirable(?: criteria| requirements| skills)?|nice to have|preferred qualifications|bonus|a plus)\s*:?$/i.test(line)){section='desirable';continue;}
    if(/^(?:benefits|perks|nice to have$|about us|what we offer|our (?:team|mission|benefits)|responsibilities|equal opportunit|as an equal opportunity|interviewing with|how to apply|application process|disclosure and barring|certificate of sponsorship|employer details|additional information|#LI-)/i.test(line)){section='unspecified';continue;}
    let target=/\bdesirable|\bpreferred|nice to have|not (?:essential|required)|a (?:bonus|plus)\b/i.test(line)?'desirable':/\brequired|\bmust\b|\bessential|minimum of|at least\b|you(?:'|’)ll have|you will have|we require/i.test(line)?'essential':section;
    out[target].push(line);
  }
  // Publisher-labelled requirements take precedence over guesses from the whole page.
  for(const key of ['essential','desirable'])if(Array.isArray(explicit[key]))out[key]=[...new Set(explicit[key])];
  return out;
}
function yearsIn(s){
  const named=s.replace(/\b(one|two|three|four|five|six|seven|eight|ten)\b/gi,m=>({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,ten:10}[m.toLowerCase()]));
  return [...named.matchAll(/\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*\+?\s*years?(?:['’])?(?:\s+of)?\s+(?:\w+\s+){0,4}experience/gi)].map(m=>+m[1]);
}
export function assess(job, config={}, at=new Date()) {
  const cfg={...DEFAULTS,...config}, title=job.title||'', desc=job.description||'', all=title+'\n'+desc;
  const req=extractRequirements(job), positive=[], issues=[], barriers=[], gates={};
  if(cfg.exclude_employers.some(name=>normal(name)===normal(job.employer)))barriers.push('Employer excluded in your saved preferences');
  const matched=Object.entries(signals).filter(([key,re])=>cfg.skills.includes(key)&&re.test(all)).map(([k])=>k);
  matched.forEach(k=>positive.push(`${k[0].toUpperCase()+k.slice(1)} appears in the advert`));
  const family=classifyFamily(job);
  const roleRelevant=/analyst|analytical|scientist|science|research|bioinformatic|biolog|statistic|data|evidence|regulat|laboratory|technician|ecolog|environment|plant|crop|agricultur|biosecurity|machine learning|software|programmer/i.test(title);
  const genericCare=/nursery|care assistant|support worker|social worker|teacher|teaching assistant|youth worker|childcare/i.test(title)&&!/research|data|analyst|statistic/i.test(title);
  if(!roleRelevant||family==='Other'||genericCare)barriers.push('Role is outside the scientific, analytical or research focus');
  if(/account executive|sales (?:representative|manager|director)|business development|recruitment consultant|talent partner|recruiter|customer success manager/i.test(title))barriers.push('Commercial, recruitment or sales role rather than a scientific / analytical role');
  const senior=/\b(senior|principal|director|head of|professor|postdoc(?:toral)?|post-doctoral|consultant physician|staff scientist|lead)\b/i.test(title);
  if(/\b(director|head of|professor|postdoc(?:toral)?|post-doctoral|consultant physician)\b/i.test(title))barriers.push('Role indicates executive, doctoral or clinical-professional expertise');
  else if(senior)issues.push('Senior-level title: check the actual grade and required experience');
  if(/#LI-MidSenior/i.test(desc)||/\bmanager\b/i.test(title)&&/lead (?:product |the )?strategy|own (?:the )?(?:roadmap|product plan)|manage (?:a |the )?(?:team|department)|line management|people management/i.test(desc))barriers.push('Role requires established management or strategic ownership');
  const essential=req.essential.filter(s=>!/(?:no|without)\s+(?:prior |previous |professional )?experience (?:is )?(?:required|necessary)/i.test(s));
  const hard=essential.join('\n');
  const mandatoryYears=Math.max(0,...yearsIn(hard));
  const unspecifiedYears=Math.max(0,...yearsIn(req.unspecified.join('\n')));
  if(mandatoryYears>cfg.max_experience)barriers.push(`${mandatoryYears}+ years of required experience exceeds your early-career profile`);
  if(unspecifiedYears>cfg.max_experience)issues.push(`${unspecifiedYears}+ years of experience mentioned; confirm whether mandatory`);
  const preferredYears=Math.max(0,...yearsIn(req.desirable.join('\n')));
  if(preferredYears>cfg.max_experience)issues.push(`${preferredYears}+ years preferred, not treated as a mandatory barrier`);
  const knownQualifications=cfg.qualifications.join(' ').toLowerCase();
  const gaps=[];let qualificationUnconfirmed=false;
  for(const line of essential){
    if(/\bmaster(?:'|’)?s?\b|\bMSc\b|\bMRes\b/i.test(line)&&!/bachelor|\bbsc\b|or equivalent experience/i.test(line)&&!/master|msc|mres/.test(knownQualifications)){
      if(cfg.pending_qualifications.some(q=>/master|msc|mres/i.test(q))){qualificationUnconfirmed=true;issues.push('Master’s award is pending/unconfirmed; confirm completion and the employer’s timing requirement');}
      else gaps.push('A Master’s degree is required; the award is not established in your profile');
    }
    if(/\bph\.?d\b|doctorate|doctoral degree/i.test(line)&&!/or equivalent (?:research )?experience|working towards/i.test(line)&&!knownQualifications.includes('phd'))gaps.push('Doctoral qualification required');
    if(/\b(?:HCPC|GMC|NMC|ACCA|CIMA|CIPD)\b/i.test(line)){
      for(const c of line.match(/\b(?:HCPC|GMC|NMC|ACCA|CIMA|CIPD)\b/gi)||[])if(!cfg.certifications.map(normal).includes(normal(c)))gaps.push(`${c.toUpperCase()} registration / certification required`);
    }
    if(/(?:registered|qualified) (?:nurse|doctor|social worker)|medical degree|veterinary degree|MBBS/i.test(line))gaps.push('Mandatory professional qualification absent from your profile');
    if(/(?:extensive|substantial|significant) .{0,40}(?:professional|industry|management|leadership) experience|(?:professional|industry|management|leadership) .{0,20}(?:essential|required)/i.test(line))gaps.push('Substantial professional or management experience required');
    if(/(?:degree|qualification) in (?:law|accounting|architecture|civil engineering|veterinary)/i.test(line))gaps.push('Different specialist degree required');
  }
  barriers.push(...new Set(gaps));
  const missingTechnical=[];
  for(const skill of ['SQL','SAS','C++','Java','ArcGIS','Power BI','Tableau','AWS','GCP','SAP']){
    const escaped=skill.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const pattern=new RegExp('(?:^|[^a-zA-Z])'+escaped+'(?=$|[^a-zA-Z])','i');
    const alternativeSatisfied=line=>[...line.matchAll(/\b(?:SQL|Python|SAS|R|Java)(?:\s*,\s*(?:SQL|Python|SAS|R|Java))*\s*(?:,\s*)?\bor\s+(?:SQL|Python|SAS|R|Java)\b/gi)].some(m=>new RegExp('\\b'+escaped+'\\b','i').test(m[0])&&cfg.skills.some(k=>new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(m[0])));
    if(essential.some(line=>pattern.test(line)&&!alternativeSatisfied(line))&&!cfg.skills.some(x=>x.toLowerCase()===skill.toLowerCase()))missingTechnical.push(skill);
  }
  if(/\bR\b(?!\s*&\s*D)/.test(hard)&&!cfg.skills.includes('r'))missingTechnical.push('R');
  missingTechnical.forEach(k=>issues.push(`Essential skill not confirmed in your profile: ${k}`));
  const uncovered=essential.filter(s=>s.length>180&&/experience with|experience (?:of|in)|expertise|proficien/i.test(s)||/ph\.?d|doctorate/i.test(s)&&/or equivalent|working towards/i.test(s)||/experience|knowledge|proficien|expert|certif|degree|qualification|skills|registration/i.test(s)&&
    !Object.values(signals).some(re=>re.test(s))&&!/communication|teamwork|collaborat|organis|problem.solv|attention to detail|bsc|bachelor|life science/i.test(s));
  if(uncovered.length)issues.push(`${uncovered.length} essential criterion/criteria need your review`);
  const earlyWording=/\b(?:graduate|junior|entry[- ]level|trainee|research assistant|assistant analyst)\b/i.test(title)||/recent (?:university )?graduates?|no (?:prior |previous |professional )?experience (?:is )?(?:required|necessary)|0\s*[-–]\s*2\s*years/i.test(desc);
  const early=earlyWording||(mandatoryYears>0&&mandatoryYears<=cfg.max_experience)||!!job.review?.early_career;
  if(early)positive.push('Evidence of early-career accessibility');else issues.push('Early-career accessibility needs confirmation');
  const restricted=/\b(?:United States|USA|Canada|Germany|Switzerland|France|Australia|India|China|Netherlands|Ireland|Spain|Portugal|Italy|Poland|Japan|Korea|Singapore|New York|California|Massachusetts|Ohio|New Jersey|Texas|Boston|Toronto|Barcelona|Madrid|Lisbon|Paris|Berlin|Dublin)\b/i.test(job.location||'')&&!/\b(?:UK|United Kingdom|London)\b/i.test(job.location||'');
  if(restricted&&!job.remote_uk)barriers.push('Work location is outside the London / UK-remote target');
  const commute=job.commute, validCommute=cfg.origin_routing.trim()&&commute&&Number.isFinite(commute.minutes)&&commute.minutes>=0&&commute.destination&&(commute.origin===cfg.origin_routing)&&(!commute.expires_at||commute.expires_at>at.toISOString());
  const eligible=!!(job.remote_uk||(validCommute&&commute.minutes<=cfg.commute_limit));
  const borderline=validCommute&&commute.minutes>cfg.commute_limit&&commute.minutes<=cfg.commute_limit+cfg.borderline_minutes;
  if(job.remote_uk)positive.push('Remote role explicitly available in the UK');
  else if(validCommute) (eligible?positive:issues).push(`${commute.minutes}-minute ${commute.method==='manual'?'user estimate':'TfL public-transport estimate'} from ${cfg.origin}`);
  else issues.push('Commute unavailable — exact workplace / station and a route are needed');
  const outsideLondon=!eligible&&!/\bLondon\b/i.test(job.location||'')&&/\b(?:Cambridge|Oxford|Birmingham|Manchester|Liverpool|Leeds|Nottingham|Edinburgh|Newmarket|Guildford|Bristol|Sheffield|York|Leicester|Dundee|Newcastle|Glasgow)\b/i.test(job.location||'');
  if(outsideLondon)issues.push('Workplace is outside London; location is a significant limitation until a suitable route is verified');
  if(job.work_pattern==='Remote'&&!job.remote_uk)issues.push('UK remote eligibility is unconfirmed');
  if(job.remote_restricted)issues.push('Advert restricts remote work by residence or office attendance; verify the location requirement');
  if(validCommute&&commute.minutes>cfg.commute_limit+cfg.borderline_minutes)issues.push('Commute exceeds your limit and borderline allowance');
  if(cfg.minimum_salary&&job.salary_min==null)issues.push('Annual GBP salary is unconfirmed');
  const salaryOK=!cfg.minimum_salary||(job.salary_min!=null&&job.salary_min>=cfg.minimum_salary);
  if(cfg.minimum_salary&&job.salary_min!=null&&job.salary_min<cfg.minimum_salary)issues.push('Advertised minimum salary is below your preference');
  const expired=!!job.closing_date&&job.closing_date<londonDate(at);
  if(expired)barriers.push('Advertised closing date has passed');
  const freshCheck=job.fetched_at&&(+at-new Date(job.fetched_at)<7*86400000);
  const open=!expired&&!!job.verified_open&&freshCheck;
  if(!open&&!expired)issues.push('Open status needs verification (last check must be within 7 days)');
  if(!job.credible)issues.push('Employer credibility needs confirmation');
  if((job.description||'').length<250)issues.push('Full requirements are not yet available');
  for(const line of req.desirable)if(/\bR\b|plant|crop|specific|specialist|qualification|certif|experience/i.test(line))issues.push(`Desirable only: ${line.slice(0,180)}`);
  const methods=matched.filter(x=>['python','pandas','numpy','sql','duckdb','statistics','data analysis','data quality','data integration','dashboards','automation','machine learning','visualisation','scientific computing','databases'].includes(x));
  const strongOverlap=matched.length>=4&&methods.length>=1&&roleRelevant&&family!=='Other';
  const reviewed=!!job.review?.requirements_checked;
  gates.early_career=early&&!senior&&mandatoryYears<=cfg.max_experience;
  gates.skill_overlap=strongOverlap;
  gates.location=eligible;
  gates.salary=salaryOK;
  gates.requirements=barriers.length===0&&!qualificationUnconfirmed&&unspecifiedYears<=cfg.max_experience&&(reviewed||(essential.length>=2&&uncovered.length===0&&missingTechnical.length===0))&&desc.length>=250;
  gates.open=open;
  gates.credible_employer=!!job.credible;
  gates.application_route=!!job.url;
  let score=Math.min(80,matched.length*7+(early?10:0)+(eligible?8:0));
  const preference=Math.max(-10,Math.min(10,(cfg.weights?.[family]||0)+matched.reduce((n,k)=>n+(cfg.weights?.[k]||0),0)));
  score=Math.max(0,Math.min(100,score+preference-barriers.length*25-(early?0:12)-(outsideLondon?18:0)-(unspecifiedYears>cfg.max_experience?22:0)-Math.min(15,uncovered.length*3)));
  let category=Object.values(gates).every(Boolean)?'Complete Hit':
    barriers.length===0&&strongOverlap&&gates.early_career&&salaryOK&&(eligible||(/London/i.test(job.location)&&!validCommute))&&gates.requirements?'Strong Match':'Explore';
  if(borderline&&strongOverlap&&barriers.length===0)category='Borderline';
  const plausibleOverlap=matched.length>=2&&(methods.length>0||matched.includes('research')&&matched.includes('biology'));
  const unresolvedLocal=job.remote_uk||(validCommute?commute.minutes<=cfg.commute_limit:/\bLondon\b/i.test(job.location));
  if(category==='Explore'&&barriers.length===0&&plausibleOverlap&&roleRelevant&&score>=18&&(early||!senior)&&unspecifiedYears<=cfg.max_experience&&uncovered.length<=3&&unresolvedLocal)category='Conditional Match';
  if(barriers.length)category='Filtered';
  const excludes=cfg.exclude_keywords.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(excludes.some(k=>all.toLowerCase().includes(k))){barriers.push('Matches a globally excluded keyword');category='Filtered';}
  const includes=cfg.include_keywords.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(includes.length&&!includes.some(k=>all.toLowerCase().includes(k))){issues.push('Does not match your global include keywords');if(category!=='Filtered')category='Explore';}
  return {category,score,family,early_career:early,matched,positive,issues:[...new Set(issues)].slice(0,15),barriers:[...new Set(barriers)],gates,requirements:req,unreviewed_requirements:uncovered,preference,engine_version:2};
}
