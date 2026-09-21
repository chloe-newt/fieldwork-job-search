import {get} from './network.mjs';
import {hash,now} from './util.mjs';
export async function route(store,job,{force=false}={}){
  const cfg=store.settings();const destination=(job.workplace||job.nearest_station||'').trim();
  if(job.remote_uk)return {minutes:0,method:'remote',origin:cfg.origin_routing,destination:'UK remote',checked_at:now()};
  if(!cfg.origin_routing.trim())return {minutes:null,method:'unavailable',reason:'Set your commute origin in Settings before calculating a route.'};
  if(!destination)return {minutes:null,method:'unavailable',reason:'Add the exact workplace postcode or nearest station. A city name is not a commute destination.'};
  if(!cfg.routing_enabled)return {minutes:null,method:'unavailable',reason:'Live routing disabled in Settings'};
  const key=hash(cfg.origin_routing+'|'+destination+'|weekday0800');const cached=store.db.prepare('SELECT * FROM commute_cache WHERE key=?').get(key);
  if(!force&&cached&&cached.expires_at>now())return {...JSON.parse(cached.data),cached:true};
  const d=new Date();d.setUTCDate(d.getUTCDate()+1);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);
  const date=d.toISOString().slice(0,10).replaceAll('-','');
  const params=new URLSearchParams({date,time:'0800',timeIs:'Departing',journeyPreference:'LeastTime',mode:'tube,dlr,overground,elizabeth-line,bus,national-rail',...(cfg.tfl_key?{app_key:cfg.tfl_key}:{})});
  try{
    const response=await get(`https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(cfg.origin_routing)}/to/${encodeURIComponent(destination)}?${params}`,{json:true});
    const choices=(response.journeys||[]).filter(j=>Number.isFinite(j.duration));if(!choices.length)throw Error('TfL could not resolve an unambiguous route. Use a postcode or a precise station name.');
    const best=choices.sort((a,b)=>a.duration-b.duration)[0];const value={minutes:best.duration,method:'tfl',origin:cfg.origin_routing,destination,checked_at:now(),expires_at:new Date(Date.now()+7*86400000).toISOString(),departure:best.startDateTime,arrival:best.arrivalDateTime,summary:(best.legs||[]).map(l=>l.instruction?.summary).filter(Boolean).join(' → '),note:'Fastest returned route for next weekday at 08:00. Estimate; check actual travel before applying.'};
    store.db.prepare('INSERT INTO commute_cache(key,data,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at').run(key,JSON.stringify(value),value.expires_at);return value;
  }catch(e){return {minutes:null,method:'unavailable',origin:cfg.origin_routing,destination,checked_at:now(),reason:e.message};}
}
