"""A successful management start is not inference readiness."""
import hashlib,json,os,time
from pathlib import Path
STATE=Path(__file__).resolve().parent/'runs/nosana-readiness.json'
def fingerprint():
 fields=[os.getenv(k,'') for k in ['NOSANA_INFERENCE_BASE_URL','NOSANA_MODEL','NOSANA_PROTOCOL','NOSANA_INFERENCE_API_KEY']]
 return hashlib.sha256(json.dumps(fields).encode()).hexdigest()
def record(status,reason=None):
 STATE.parent.mkdir(exist_ok=True)
 data={'status':status,'reason':reason,'checkedAt':time.time(),'fingerprint':fingerprint()}
 p=STATE.with_suffix('.tmp');p.write_text(json.dumps(data));p.replace(STATE)
 return data

def connection():
 if not os.getenv('NOSANA_INFERENCE_BASE_URL'):return {'status':'unconnected','reason':'nosana_endpoint_not_ready'}
 try:data=json.loads(STATE.read_text())
 except (OSError,ValueError):data={}
 if data.get('fingerprint')!=fingerprint():return {'status':'configured_unverified','reason':'nosana_preparation_required'}
 if data.get('status')=='ready' and 0<=time.time()-data.get('checkedAt',0)<=300:return {'status':'ready','reason':None}
 return {'status':data.get('status','configured_unverified') if data.get('status')!='ready' else 'configured_unverified','reason':data.get('reason') or 'nosana_readiness_expired'}
