// Employer names and board identifiers adapted from MadsLorentzen/ai-job-search.
// See THIRD_PARTY_NOTICES.md for attribution and the upstream MIT licence.
export const SOURCE_CATALOG = [
  ['Riverlane','riverlane','greenhouse','Quantum computing'],
  ['PsiQuantum','psiquantum','greenhouse','Quantum computing'],
  ['Isomorphic Labs','isomorphiclabs','greenhouse','Biotechnology'],
  ['Graphcore','graphcore','greenhouse','Computing'],
  ['Wayve','wayve','greenhouse','AI research'],
  ['Monzo','monzo','greenhouse','Finance'],
  ['Stripe','stripe','greenhouse','Finance'],
  ['Cloudflare','cloudflare','greenhouse','Technology'],
  ['Synthesia','synthesia','ashby','AI technology'],
  ['Improbable','improbable','ashby','Simulation'],
  ['Palantir','palantir','lever','Data technology']
].map(([name,board,type,employer_type])=>({id:`catalog-${type}-${board}`,name,board,type,employer_type,interval_hours:48,credible:true,enabled:true}));

// Resolve only recognised hosted boards. This parses a URL locally; it does not
// fetch arbitrary sites or guess whether a company's board exists.
export function sourceFromURL(raw){
  let u;try{u=new URL(raw)}catch{throw Error('Enter a full employer careers-board URL')}
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Use a public HTTPS careers-board URL');
  const host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean);
  let type,board=parts[0],region;
  if(['boards.greenhouse.io','job-boards.greenhouse.io'].includes(host))type='greenhouse';
  else if(['jobs.lever.co','jobs.eu.lever.co'].includes(host)){type='lever';if(host==='jobs.eu.lever.co')region='eu'}
  else if(host==='jobs.ashbyhq.com')type='ashby';
  else if(['jobs.smartrecruiters.com','careers.smartrecruiters.com'].includes(host))type='smartrecruiters';
  if(!type||!/^[a-zA-Z0-9_-]{1,100}$/.test(board||''))throw Error('Use a Greenhouse, Lever, Ashby or SmartRecruiters hosted board URL, or enter its identifier below');
  const known=SOURCE_CATALOG.find(s=>s.type===type&&s.board.toLowerCase()===board.toLowerCase());
  return {type,board,...(region?{region}:{}),name:known?.name||board,employer_type:known?.employer_type||'Unknown',interval_hours:48,credible:!!known};
}
