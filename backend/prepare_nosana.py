"""Explicit pre-demo warmup. Never run inside a meal request."""
import json,os,sys,time
from pathlib import Path
import requests
from dotenv import load_dotenv
ROOT=Path(__file__).resolve().parents[1];load_dotenv(ROOT/'.env');sys.path.insert(0,str(ROOT/'validation'))
from inference import select
from nosana_readiness import record

def prepare():
 base=os.getenv('NOSANA_INFERENCE_BASE_URL','').rstrip('/');protocol=os.getenv('NOSANA_PROTOCOL','ollama');key=os.getenv('NOSANA_INFERENCE_API_KEY','')
 if not base.startswith('https://'):raise ValueError('https_endpoint_required')
 if key.startswith('nos_'):raise ValueError('management_key_is_not_inference_key')
 headers={'Authorization':'Bearer '+key} if key else {}
 record('warming','nosana_model_warming');start=time.monotonic()
 try:
  response=requests.get(base+('/api/tags' if protocol=='ollama' else '/v1/models'),headers=headers,timeout=(3,10),allow_redirects=False);response.raise_for_status();body=response.json()
  names=[m.get('name') for m in body.get('models',[])] if protocol=='ollama' else [m.get('id') for m in body.get('data',[])]
  if os.environ['NOSANA_MODEL'] not in names:raise ValueError('configured_model_not_listed')
  candidates=json.loads((ROOT/'validation/artifacts/aura-result.json').read_text())['candidates'][:3]
  # Use the actual application schema and real candidate IDs for both probes.
  cold=select(candidates,{'diagnostic':True},1,time.monotonic()+100,read_timeout=90)
  warm=select(candidates,{'diagnostic':True},1,time.monotonic()+25)
  record('ready');result={'status':'ready','cold':cold,'warm':warm,'seconds':round(time.monotonic()-start,3)}
 except Exception as e:
  record('configured_unverified','nosana_preparation_failed');result={'status':'failed','errorType':type(e).__name__,'seconds':round(time.monotonic()-start,3)}
 path=ROOT/'validation/artifacts/nosana-preparation.json';path.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result));return result['status']=='ready'
if __name__=='__main__':
 try:sys.exit(0 if prepare() else 1)
 except Exception as e:record('configured_unverified','nosana_preparation_failed');print(json.dumps({'status':'failed','errorType':type(e).__name__}));sys.exit(1)
