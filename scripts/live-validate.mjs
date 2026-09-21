import {Store} from '../src/store.mjs';
import {search} from '../src/search.mjs';
import {route} from '../src/commute.mjs';
const store=new Store('data');
try{
 const before=store.jobs().length;
 const repeat=await search(store,{force:true,source_id:'nhs-2',trigger:'live connector / deduplication validation'});
 const commute=await route(store,{workplace:'E14 4PU'},{force:true});
 const cached=await route(store,{workplace:'E14 4PU'});
 console.log(JSON.stringify({before,after:store.jobs().length,repeat,commute:{minutes:commute.minutes,method:commute.method,destination:commute.destination,departure:commute.departure,checked_at:commute.checked_at,error:commute.reason},cached:cached.cached},null,2));
}finally{store.close()}
