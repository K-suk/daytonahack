import {createNosanaClient,NosanaNetwork} from '@nosana/kit';
import dotenv from 'dotenv';import fs from 'node:fs';
dotenv.config({path:'.env',quiet:true});
const client=createNosanaClient(NosanaNetwork.MAINNET,{api:{apiKey:process.env.NOSANA_API_KEY}});
const out={};
for(const [name,fn] of [['credits',()=>client.api.credits.balance()],['templates',()=>client.api.templates.list()],['markets',()=>client.api.markets.getPrices()],['deployments',()=>client.api.deployments.list()]]){
 const t=performance.now();try{const x=await fn();out[name]={status:'success',seconds:(performance.now()-t)/1000,data:JSON.parse(JSON.stringify(x))};console.log(name,'success');}catch(e){out[name]={status:'failed',error:e.name};console.log(name,e.name);}
}
fs.writeFileSync('validation/artifacts/nosana-discovery.json',JSON.stringify(out,null,2));
