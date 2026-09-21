// Development-only isolated browser fixture. Never writes the user's data folder.
import {Store} from '../src/store.mjs';
const s=new Store('.qa');s.saveSettings({auto_search:false});
for(const source of s.sources())s.putSource({...source,enabled:false});
s.ingest({title:'QA · Graduate Research Analyst',employer:'Synthetic UI Test',url:'https://example.org/fieldwork-qa',location:'London, UK',work_pattern:'Remote',remote_uk:true,credible:true,verified_open:true,salary:'£34,000 per annum',closing_date:'2099-12-31',description:'This is an isolated synthetic browser test, not a real vacancy. A graduate biological research analyst uses Python, pandas, statistics and data visualisation to explore scientific datasets with supervised research and ongoing training.\nEssential\nBSc in biology\nPython and statistics skills\nDesirable\nPlant science experience preferred.'});
s.close();
