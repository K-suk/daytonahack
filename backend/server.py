"""Local-only asynchronous JSON API; progress polling is ordered by sequence."""
import copy,json,os,threading,time,uuid
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from dotenv import load_dotenv
from pydantic import BaseModel,ConfigDict,Field,ValidationError
from pipeline import execute
from schema import Conditions
from nosana import connection
from materials import load_manifest,local_file,catalog
from planning import alternatives,swap
import html,mimetypes
ROOT=Path(__file__).resolve().parents[1];load_dotenv(ROOT/'.env');RUNS=ROOT/'backend/runs';RUNS.mkdir(exist_ok=True)
lock=threading.RLock();runs={};active=None
class Start(BaseModel):
 model_config=ConfigDict(extra='forbid')
 conditions:Conditions=Field(default_factory=Conditions)
 days:int=Field(default=7,ge=1,le=7)

def persist(r):
 p=RUNS/r['runId'];p.mkdir(exist_ok=True);tmp=p/'state.tmp';tmp.write_text(json.dumps(r,ensure_ascii=False,indent=2));tmp.replace(p/'state.json')
def worker(r,request):
 global active
 rid=r['runId']
 def emit(stage,status,**details):
  with lock:
   if r.get('cancelRequested'):raise RuntimeError('cancelled')
   r['events'].append(dict(runId=rid,sequence=len(r['events'])+1,stage=stage,status=status,elapsedSeconds=round(time.monotonic()-start,3),**details));persist(r)
 start=time.monotonic()
 try:
  result=execute(rid,request.conditions,request.days,RUNS/rid,emit)
  with lock:
   if r.get('cancelRequested'):raise RuntimeError('cancelled')
   r.update(status=result['status'],result=result)
 except Exception as e:
  with lock:
   cancelled=r.get('cancelRequested',False);r.update(status='cancelled' if cancelled else 'failed',result={'runId':rid,'status':'cancelled' if cancelled else 'failed','route':'saved','mealPlan':None,'stopReasons':['cancelled' if cancelled else 'pipeline_failed'],'errorType':type(e).__name__})
 finally:
  with lock:
   r['events'].append(dict(runId=rid,sequence=len(r['events'])+1,stage='run.'+r['status'],status=r['status'],stopReasons=r['result']['stopReasons'],elapsedSeconds=round(time.monotonic()-start,3)));persist(r);active=None

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,status,data):
  raw=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);origin=self.headers.get('Origin')
  if origin in ['http://localhost:3000','http://127.0.0.1:3000','http://localhost:3001','http://127.0.0.1:3001','http://localhost:4312','http://127.0.0.1:4312']:self.send_header('Access-Control-Allow-Origin',origin);self.send_header('Vary','Origin')
  self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def do_OPTIONS(self):
  self.send_response(204)
  origin=self.headers.get('Origin')
  if origin in ['http://localhost:3000','http://127.0.0.1:3000','http://localhost:3001','http://127.0.0.1:3001','http://localhost:4312','http://127.0.0.1:4312']:self.send_header('Access-Control-Allow-Origin',origin)
  self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type');self.end_headers()
 def do_GET(self):self.handle_api(False)
 def do_POST(self):self.handle_api(True)
 def handle_api(self,post):
  global active
  try:
   origin=self.headers.get('Origin')
   if origin and origin not in ['http://localhost:3000','http://127.0.0.1:3000','http://localhost:3001','http://127.0.0.1:3001','http://localhost:4312','http://127.0.0.1:4312']:return self.respond(403,{'error':'origin_not_allowed'})
   url=urlparse(self.path);parts=url.path.strip('/').split('/')
   if not post and parts==['api','documents']:return self.respond(200,{'documents':catalog()})
   if not post and len(parts)==4 and parts[:2]==['api','documents'] and parts[3]=='preview':
    doc=next((d for d in load_manifest().documents if d.documentId==parts[2]),None)
    if not doc:return self.respond(404,{'error':'document_not_found'})
    p=local_file(doc);raw=p.read_bytes();mime=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    if doc.format in ['html','json']:mime='text/plain; charset=utf-8'
    self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"sandbox; default-src 'none'");self.send_header('Content-Disposition','inline');self.end_headers();self.wfile.write(raw);return
   if not post and parts==['api','health']:return self.respond(200,{'status':'ok','mode':'saved','nosana':connection()})
   if post and parts==['api','runs']:
    if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.respond(415,{'error':'json_required'})
    length=int(self.headers.get('Content-Length','0'))
    if not 0<length<=65536:return self.respond(400,{'error':'invalid_body_size'})
    request=Start.model_validate_json(self.rfile.read(length))
    with lock:
     if active:return self.respond(409,{'error':'run_in_progress','runId':active})
     rid=str(uuid.uuid4());r=dict(runId=rid,status='running',createdAt=datetime.now(timezone.utc).isoformat(),route='saved',events=[],result=None);runs[rid]=r;active=rid;persist(r);threading.Thread(target=worker,args=(r,request),daemon=True).start()
    return self.respond(202,{'runId':rid,'status':'running','progressUrl':f'/api/runs/{rid}/events','resultUrl':f'/api/runs/{rid}/result'})
   if len(parts)<3 or parts[:2]!=['api','runs']:return self.respond(404,{'error':'not_found'})
   rid=parts[2]
   try:uuid.UUID(rid)
   except ValueError:return self.respond(404,{'error':'run_not_found'})
   with lock:
    r=runs.get(rid)
    if not r:
     p=RUNS/rid/'state.json'
     if p.exists():
      r=json.loads(p.read_text())
      if r['status']=='running':r.update(status='interrupted',result={'runId':rid,'status':'interrupted','route':'saved','mealPlan':None,'stopReasons':['server_restarted']})
     else:return self.respond(404,{'error':'run_not_found'})
    action=parts[3] if len(parts)==4 else None
    if post and action=='cancel':
     if r['status']=='running':r['cancelRequested']=True;persist(r)
     return self.respond(202,{'runId':rid,'status':r['status'],'cancelRequested':r.get('cancelRequested',False)})
    if post and action=='swap':
     length=int(self.headers.get('Content-Length','0'))
     if not 0<length<=65536:return self.respond(400,{'error':'invalid_body_size'})
     payload=json.loads(self.rfile.read(length))
     if set(payload)!={'day','recipeId','revision'} or type(payload['day']) is not int or type(payload['revision']) is not int:return self.respond(400,{'error':'invalid_swap'})
     try:r['result']=swap(r['result'] or {},payload['day'],payload['recipeId'],payload['revision'])
     except ValueError as e:return self.respond(409,{'error':str(e),'runId':rid})
     r['status']=r['result']['status'];runs[rid]=r;r['events'].append({'runId':rid,'sequence':len(r['events'])+1,'stage':'calculation.completed','status':'complete','revision':r['result']['revision']});persist(r);return self.respond(200,r['result'])
    if not post and action=='alternatives':
     try:items=alternatives(r['result'] or {})
     except ValueError as e:return self.respond(409,{'error':str(e),'runId':rid,'alternatives':[]})
     return self.respond(200,{'runId':rid,'revision':r['result']['revision'],'alternatives':items})
    if not post and action=='events':
     after=int(parse_qs(url.query).get('after',['0'])[0]);return self.respond(200,{'runId':rid,'status':r['status'],'events':[e for e in r['events'] if e['sequence']>after]})
    if not post and action=='result':return self.respond(202 if r['status']=='running' else 200,r['result'] or {'runId':rid,'status':'running','mealPlan':None})
    if not post and len(parts)==3:return self.respond(200,{k:v for k,v in r.items() if k not in ['events','result']})
   self.respond(404,{'error':'not_found'})
  except (ValueError,ValidationError):self.respond(400,{'error':'invalid_request'})
  except Exception:self.respond(500,{'error':'internal_error'})
if __name__=='__main__':
 print('Saved pipeline API: http://127.0.0.1:8787',flush=True);ThreadingHTTPServer(('127.0.0.1',8787),Handler).serve_forever()
