// Existing validated configuration only. This module never creates a deployment or tops up.
import {createNosanaClient,NosanaNetwork} from '@nosana/kit';
import dotenv from 'dotenv';import fs from 'node:fs';import {spawnSync} from 'node:child_process';
dotenv.config({path:'.env',quiet:true});
const action=process.argv[2];const allowed=['status','start','prepare','stop'];
if(!allowed.includes(action)){console.error('Usage: node validation/nosana/lifecycle.mjs status|start|prepare|stop');process.exit(2)}
const c=createNosanaClient(NosanaNetwork.MAINNET,{api:{apiKey:process.env.NOSANA_API_KEY}});
const known=JSON.parse(fs.readFileSync('validation/artifacts/nosana-available-start-result.json'));const id=known.deploymentId;
function invalidate(reason){fs.mkdirSync('backend/runs',{recursive:true});fs.writeFileSync('backend/runs/nosana-readiness.json',JSON.stringify({status:'configured_unverified',reason,checkedAt:Date.now()/1000}));}
async function stop(){
 invalidate('nosana_stopping');let last;
 for(let i=0;i<3;i++){
  try{let d=await c.api.deployments.get(id);if(d.status!=='STOPPED')await d.stop();d=await c.api.deployments.get(id);const j=await d.getJobs();last={status:d.status,jobs:j.jobs.map(x=>({state:x.state,nodeAssigned:!!x.node}))};if(d.status==='STOPPED'&&j.jobs.every(x=>['STOPPED','COMPLETED'].includes(x.state))){invalidate('nosana_stopped');return last}}catch(e){last={error:e.name}}
  await new Promise(r=>setTimeout(r,3000));
 }
 invalidate('nosana_stop_unconfirmed');throw Error('stop_unconfirmed');
}
try{
 let d=await c.api.deployments.get(id);const jobs=await d.getJobs();let result={action,deploymentId:id,status:d.status};
 if(action==='start'){
  const all=await c.api.deployments.list();if(all.deployments.some(x=>x.status!=='STOPPED')||jobs.jobs.some(x=>!['STOPPED','COMPLETED'].includes(x.state)))throw Error('existing_job_not_stopped');
  const prices=await c.api.markets.getPrices();const price=prices.find(x=>x.name==='NVIDIA 3080');const queue=await c.api.hosts.getQueuedNodes({marketAddress:price?.address});const balance=await c.api.credits.balance();
  if(!price||price.usd_reward_per_hour>.25||d.market!==price.address||d.replicas!==1||d.timeout!==60||!Array.isArray(queue)||!queue.length)throw Error('capacity_configuration_or_price_not_valid');
  if(balance.assignedCredits-balance.reservedCredits-balance.settledCredits<1)throw Error('insufficient_credit_margin');
  invalidate('nosana_starting');await d.start();result={...result,status:'starting',waitingNodes:queue.length,priceUsdPerHour:price.usd_reward_per_hour};
 }else if(action==='prepare'){
  const endpoint=d.endpoints.find(e=>e.online&&e.url?.startsWith('https://'));
  if(!endpoint||!jobs.jobs.some(j=>j.node&&j.state==='RUNNING'))throw Error('node_or_endpoint_not_ready');
  const base=endpoint.url.replace(/\/$/,'');const model='gemma3:4b-it-qat';
  const probe=spawnSync('.venv/bin/python',['backend/prepare_nosana.py'],{env:{...process.env,NOSANA_INFERENCE_BASE_URL:base,NOSANA_MODEL:model,NOSANA_PROTOCOL:'ollama'},timeout:145000,encoding:'utf8'});
  if(probe.status!==0){await stop();throw Error('preparation_failed_resource_stopped')}
  // Persist only the endpoint that passed actual cold and warm inference tests.
  let env=fs.readFileSync('.env','utf8');for(const [key,value] of Object.entries({NOSANA_INFERENCE_BASE_URL:base,NOSANA_MODEL:model,NOSANA_PROTOCOL:'ollama'})){
   if(/[\r\n]/.test(value))throw Error('invalid_env_value');const line=key+'='+JSON.stringify(value);const re=new RegExp('^'+key+'=.*$','m');env=re.test(env)?env.replace(re,line):env+'\n'+line+'\n';
  }fs.writeFileSync('.env',env,{mode:0o600});result={...result,status:'ready',restartBackendRequired:true};
 }else if(action==='stop'){result={...result,...await stop()};}
 else result={...result,nodeAssigned:jobs.jobs.some(j=>j.node&&j.state==='RUNNING'),endpointOnline:d.endpoints.some(e=>e.online),credits:await c.api.credits.balance()};
 fs.writeFileSync('validation/artifacts/nosana-lifecycle-last.json',JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2));console.log(JSON.stringify(result));
}catch(e){console.error(JSON.stringify({status:'failed',error:String(e.message).replace(/nos_[\w-]+/g,'[redacted]').slice(0,180)}));process.exitCode=1}
