import json,time,sys,os
from pathlib import Path
import requests
sys.path.insert(0,'validation')
from inference import select
p=Path('validation/artifacts/nosana-available-start-result.json');r=json.loads(p.read_text());base=r['observations'][-1]['endpoints'][0]['url'];out={'baseUrl':base,'status':'failed'};t=time.monotonic()
try:
 response=requests.get(base+'/api/tags',timeout=(5,15));out['tagsStatus']=response.status_code;out['tagsBody']=response.text[:1500]
 response.raise_for_status()
 candidates=json.load(open('validation/artifacts/aura-result.json'))['candidates'][:3];ids=[x['recipeId'] for x in candidates]
 response=requests.post(base+'/api/chat',json={'model':'gemma3:4b-it-qat','stream':False,'format':{'type':'object','properties':{'recipeId':{'type':'string','enum':ids}},'required':['recipeId'],'additionalProperties':False},'options':{'num_ctx':2048,'num_predict':64,'temperature':0},'messages':[{'role':'user','content':json.dumps({'instruction':'Choose one supplied ID. JSON only.','candidates':[{'recipeId':x['recipeId'],'title':x['title']} for x in candidates]},ensure_ascii=False)}]},timeout=(5,45));out['httpStatus']=response.status_code;response.raise_for_status();body=response.json();chosen=json.loads(body['message']['content']);assert set(chosen)=={'recipeId'} and chosen['recipeId'] in ids;out.update(status='success',selection=chosen)
 os.environ.update(NOSANA_INFERENCE_BASE_URL=base,NOSANA_MODEL='gemma3:4b-it-qat',NOSANA_PROTOCOL='ollama')
 try:out['adapter']=select(candidates,{'diagnostic':True},1,time.monotonic()+25)
 except Exception as e:out['adapterError']=type(e).__name__
except Exception as e:out['error']=type(e).__name__
finally:
 out['seconds']=round(time.monotonic()-t,3);Path('validation/artifacts/nosana-available-direct.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out))
