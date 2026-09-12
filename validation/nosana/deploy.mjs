// Explicit create only; capped 60-minute one-replica validation, no top-up.
import {createNosanaClient,NosanaNetwork} from '@nosana/kit';
import dotenv from 'dotenv';import fs from 'node:fs';
dotenv.config({path:'.env',quiet:true});
const client=createNosanaClient(NosanaNetwork.MAINNET,{api:{apiKey:process.env.NOSANA_API_KEY}});
const path='validation/artifacts/nosana-deployment.json';const action=process.argv[2];
try{
 if(action==='create'){
  const balance=await client.api.credits.balance();if(balance.assignedCredits-balance.reservedCredits-balance.settledCredits<1)throw new Error('insufficient_credit_margin');
  const templates=await client.api.templates.list();const template=templates.find(t=>t.id==='qwen3-5-9b');
  const prices=await client.api.markets.getPrices();const market=prices.find(m=>m.name==='NVIDIA 3090');
  if(!template?.jobDefinition||!market||market.usd_reward_per_hour>0.25)throw new Error('unverified_template_or_price');
  const d=await client.api.deployments.create({name:'meal-validation-'+Date.now(),market:market.address,job_definition:template.jobDefinition,timeout:60,replicas:1,strategy:'SIMPLE'});
  fs.writeFileSync(path,JSON.stringify({id:d.id,createdAt:new Date().toISOString(),template:template.id,market:market.name,pricePerHour:market.usd_reward_per_hour,timeoutMinutes:60,status:d.status},null,2));
  await d.start();console.log('created and started',d.id);
 }else{
  const saved=JSON.parse(fs.readFileSync(path));const d=await client.api.deployments.get(saved.id);
  if(action==='repair-market'){const p=(await client.api.markets.getPrices()).find(x=>x.name==='NVIDIA 3090');if(!p||p.usd_reward_per_hour>0.25)throw new Error('price_cap');await d.stop();await d.updateMarket(p.address);await d.start();saved.market=p.name;saved.pricePerHour=p.usd_reward_per_hour;fs.writeFileSync(path,JSON.stringify(saved,null,2));console.log('market corrected to documented 24GB');}
  else if(action==='repair-timeout'){await d.stop();await d.updateTimeout(60);await d.start();saved.timeoutMinutes=60;saved.repairedAt=new Date().toISOString();fs.writeFileSync(path,JSON.stringify(saved,null,2));console.log('minimum timeout corrected to 60 minutes');}
  else if(action==='stop'){await d.stop();console.log('stop requested');}
  else{const jobs=await d.getJobs();fs.writeFileSync('validation/artifacts/nosana-job-status.json',JSON.stringify({deployment:JSON.parse(JSON.stringify(d)),jobs:JSON.parse(JSON.stringify(jobs))},null,2));console.log('state',d.status,'jobs',jobs.jobs.length);}
 }
}catch(e){console.log('failed',e.name,String(e.message).replace(/nos_[A-Za-z0-9_-]+/g,'[redacted]').slice(0,500));process.exitCode=1;}
