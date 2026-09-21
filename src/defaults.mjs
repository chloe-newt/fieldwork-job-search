import {SOURCE_CATALOG} from './catalog.mjs';
export const DEFAULTS = {
  origin:'', origin_routing:'', commute_limit:45, borderline_minutes:10,
  minimum_salary:0, include_keywords:'', exclude_keywords:'', auto_search:true, catch_up:true,
  skills:[], qualifications:[], pending_qualifications:[], certifications:[], exclude_employers:[], max_experience:2,
  routing_enabled:true, tfl_key:'', brave_key:'', weights:{}, last_housekeeping:'',
  profile_summary:''
};
export const FAMILIES = ['Data & computational','Biological & biomedical','Plant & agriculture','Environmental & regulatory','Child & population research'];
export const QUERIES = ['bioinformatics','research assistant','plant science','environmental data','regulatory science','child health statistics','scientific data analyst','agricultural science','government science'];
export const SOURCES = [
 {id:'civil-service',name:'Civil Service Jobs',type:'manual',url:'https://www.civilservicejobs.service.gov.uk/csr/index.cgi',interval_hours:24,note:'Direct access requires a verification challenge. Open the official search, then import advert text/link. Optional web discovery searches indexed Civil Service adverts.',employer_type:'Government'},
  ...['research assistant','data analyst','bioinformatics','child health'].map((q,i)=>({id:`nhs-${i}`,name:`NHS Jobs · ${q}`,type:'nhs',query:q,interval_hours:24,employer_type:'Healthcare',credible:true})),
 {id:'nhs-ukhsa',name:'Civil Service · UKHSA official NHS feed',type:'nhs',query:'',employer_code:'K9919',interval_hours:24,employer_type:'Government',credible:true,note:'Official UKHSA adverts syndicated to NHS Jobs. This does not cover all Civil Service departments.'},
 ...['plant science','bioinformatics','environmental science','child development','research data analyst'].map((q,i)=>({id:`academic-${i}`,name:`jobs.ac.uk · ${q}`,type:'academic',query:q,interval_hours:24,employer_type:'University',credible:true})),
 {id:'greenhouse-isomorphic',name:'Isomorphic Labs',type:'greenhouse',board:'isomorphiclabs',interval_hours:48,employer_type:'Biotechnology',credible:true},
 {id:'greenhouse-alphasights',name:'AlphaSights',type:'greenhouse',board:'alphasights',interval_hours:24,employer_type:'Research and analytics',credible:true},
 ...SOURCE_CATALOG.filter(s=>['synthesia','improbable','wayve'].includes(s.board)),
 ...['research assistant','data analyst','research technician','graduate analyst'].map((q,i)=>({id:`academic-london-${i}`,name:`jobs.ac.uk · London ${q}`,type:'academic',query:q,location:'London',interval_hours:24,employer_type:'University',credible:true})),
 {id:'lever-veeva',name:'Veeva',type:'lever',board:'veeva',interval_hours:48,employer_type:'Health technology',credible:true},
 {id:'smart-lgc',name:'LGC Group',type:'smartrecruiters',board:'LGCGroup',interval_hours:48,employer_type:'Scientific organisation',credible:true},
 {id:'smart-eurofins',name:'Eurofins',type:'smartrecruiters',board:'Eurofins',interval_hours:72,employer_type:'Scientific organisation',credible:true},
 {id:'linkedin',name:'LinkedIn Jobs',type:'manual',url:'https://www.linkedin.com/jobs/search/?keywords=graduate%20science&location=London',interval_hours:48,note:'Browser search and pasted advert imports. No automated scraping or account access.'},
 {id:'indeed',name:'Indeed',type:'manual',url:'https://uk.indeed.com/jobs?q=graduate+science&l=London',interval_hours:48,note:'Browser search and pasted advert imports. No automated scraping or account access.'},
 {id:'web',name:'Wider web · employers & Civil Service',type:'brave',interval_hours:48,note:'Optional Brave Search API key in Settings. Searches nine scientific job families and government organisations; structured advert extraction where permitted. No AI.'},
 {id:'gradcracker',name:'Gradcracker · STEM graduates',type:'manual',url:'https://www.gradcracker.com/search/science/graduate-jobs',interval_hours:48,note:'Open graduate search and import relevant adverts.'},
 {id:'environmentjob',name:'Environmentjob · environment & charities',type:'manual',url:'https://www.environmentjob.co.uk/jobs',interval_hours:48,note:'Open specialist board and import relevant adverts.'},
 {id:'kew',name:'Royal Botanic Gardens, Kew',type:'manual',url:'https://careers.kew.org/',interval_hours:48,note:'Plant science employer; browser search and advert import.'},
 {id:'rothamsted',name:'Rothamsted Research',type:'manual',url:'https://www.rothamsted.ac.uk/careers',interval_hours:48,note:'Agricultural research employer; browser search and advert import.'}
].map(s=>({enabled:true,...s}));
