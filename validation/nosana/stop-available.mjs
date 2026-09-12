import {createNosanaClient,NosanaNetwork} from '@nosana/kit';import dotenv from 'dotenv';import fs from 'node:fs';dotenv.config({path:'.env',quiet:true});const c=createNosanaClient(NosanaNetwork.MAINNET,{api:{apiKey:process.env.NOSANA_API_KEY}});const initial=JSON.parse(fs.readFileSync('validation/artifacts/nosana-available-start-result.json'));let out={deploymentId:initial.deploymentId,errors:[]};
for(let attempt=0;attempt<3;attempt++){
 try{const d=await c.api.deployments.get(initial.deploymentId);if(d.status!=='STOPPED')await d.stop();const last=await c.api.deployments.get(initial.deploymentId);const j=await last.getJobs();out.final={status:last.status,jobs:j.jobs.map(x=>({id:x.job,state:x.state,nodeAssigned:!!x.node}))};out.credits=await c.api.credits.balance();if(last.status==='STOPPED'&&j.jobs.every(x=>x.state==='STOPPED'||x.state==='COMPLETED'))break;}catch(e){out.errors.push(e.name)}
 await new Promise(r=>setTimeout(r,4000));
}
out.checkedAt=new Date().toISOString();fs.writeFileSync('validation/artifacts/nosana-available-final.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
