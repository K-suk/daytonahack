"""Allowed saved-data fallback: re-parse saved public HTML inside Daytona.
Never claims live website fetching or a new source screenshot.
"""
from pathlib import Path
from dotenv import load_dotenv
from daytona import Daytona,CreateSandboxFromSnapshotParams
import json,time,hashlib
def extract_saved(output_dir=None):
 A=Path(__file__).parent/'artifacts';load_dotenv(A.parent.parent/'.env');destination=Path(output_dir) if output_dir else A;destination.mkdir(parents=True,exist_ok=True);d=Daytona();s=None;t=time.monotonic();out={'route':'saved','processedIn':'daytona','liveFetchSuccess':False,'inputs':[]}
 try:
  s=d.create(CreateSandboxFromSnapshotParams(language='python',auto_stop_interval=3,auto_delete_interval=5,ttl_minutes=5),timeout=30)
  for n in ['cookpad-one','recipe-25675338','recipe-25962767']:
   b=(A/(n+'.html')).read_bytes();s.fs.upload_file(b,'/tmp/'+n+'.html');out['inputs'].append({'name':n,'sha256':hashlib.sha256(b).hexdigest()})
  code='''from html.parser import HTMLParser
import json,glob
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.on=False;self.text='';self.recipes=[]
 def handle_starttag(self,tag,attrs):
  if tag=='script' and dict(attrs).get('type')=='application/ld+json':self.on=True;self.text=''
 def handle_data(self,data):
  if self.on:self.text+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.on:
   self.on=False
   try:
    d=json.loads(self.text)
    if d.get('@type')=='Recipe':self.recipes.append({k:d.get(k) for k in ['url','name','recipeIngredient','recipeYield','totalTime','commentCount']})
   except ValueError:pass
result=[]
for f in glob.glob('/tmp/*.html'):
 p=Parser();p.feed(open(f).read());result.extend(p.recipes)
open('/tmp/extracted.json','w').write(json.dumps(result,ensure_ascii=False))
'''
  s.fs.upload_file(code.encode(),'/tmp/extract.py');r=s.process.exec('python /tmp/extract.py',timeout=10)
  if r.exit_code!=0:raise RuntimeError('remote_parser_failed')
  s.fs.download_file('/tmp/extracted.json',str(destination/'daytona-saved-recipes.json'))
  out.update(status='success',recipeCount=len(json.loads((destination/'daytona-saved-recipes.json').read_text())),seconds=round(time.monotonic()-t,3))
 except Exception as e:out.update(status='failed',error=type(e).__name__)
 finally:
  if s:
   try:d.delete(s,timeout=30,wait=True);out['cleanup']='deleted'
   except Exception:out['cleanup']='failed';out['sandboxId']=s.id
  out['totalSeconds']=round(time.monotonic()-t,3);(destination/'daytona-saved-result.json').write_text(json.dumps(out,indent=2))
 return out

if __name__=='__main__':
 print(json.dumps(extract_saved()))

def extract_documents(documents, output_dir, emit):
 """Parse only data with a fixed stdlib script. HTML scripts are never executed."""
 destination=Path(output_dir);destination.mkdir(parents=True,exist_ok=True)
 d=Daytona();sandbox=None;started=time.monotonic();receipt={'route':'saved','processedIn':'daytona','liveFetchSuccess':False,'inputs':[]}
 try:
  sandbox=d.create(CreateSandboxFromSnapshotParams(language='python',auto_stop_interval=3,auto_delete_interval=5,ttl_minutes=5),timeout=30)
  index=[]
  for doc,path in documents:
   raw=path.read_bytes();name=doc.documentId;remote='/tmp/input-'+name
   sandbox.fs.upload_file(raw,remote);index.append({'documentId':name,'format':doc.format,'path':remote});receipt['inputs'].append({'documentId':name,'sha256':hashlib.sha256(raw).hexdigest()});emit('document.uploaded','complete',documentId=name)
  sandbox.fs.upload_file(json.dumps(index).encode(),'/tmp/input-index.json')
  code='''import json
from html.parser import HTMLParser
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.on=False;self.text='';self.recipes=[]
 def handle_starttag(self,tag,attrs):
  if tag=='script' and dict(attrs).get('type')=='application/ld+json':self.on=True;self.text=''
 def handle_data(self,data):
  if self.on:self.text+=data
 def walk(self,d):
  if isinstance(d,list):
   for x in d:self.walk(x)
  elif isinstance(d,dict):
   typ=d.get('@type',[])
   if typ=='Recipe' or isinstance(typ,list) and 'Recipe' in typ:self.recipes.append({k:d.get(k) for k in ['url','name','recipeIngredient','recipeYield','totalTime','commentCount']})
   if '@graph' in d:self.walk(d['@graph'])
 def handle_endtag(self,tag):
  if tag=='script' and self.on:
   self.on=False
   try:self.walk(json.loads(self.text))
   except ValueError:pass
out=[]
for d in json.load(open('/tmp/input-index.json')):
 row={'documentId':d['documentId'],'format':d['format']}
 if d['format']=='html':
  p=Parser();p.feed(open(d['path']).read());row.update(recipes=p.recipes,method='jsonld')
 elif d['format']=='json':row.update(confirmed=json.load(open(d['path'])),method='confirmed_json_validation_pending')
 else:row.update(method='preview_only',automaticExtraction='unsupported')
 out.append(row)
json.dump(out,open('/tmp/documents-output.json','w'),ensure_ascii=False)
'''
  compile(code,'remote_documents','exec')
  sandbox.fs.upload_file(code.encode(),'/tmp/parse-documents.py');r=sandbox.process.exec('python /tmp/parse-documents.py',timeout=15)
  if r.exit_code!=0:raise RuntimeError('remote_parser_failed')
  sandbox.fs.download_file('/tmp/documents-output.json',str(destination/'daytona-documents.json'))
  receipt.update(status='success',seconds=round(time.monotonic()-started,3))
 finally:
  if sandbox:
   try:d.delete(sandbox,timeout=30,wait=True);receipt['cleanup']='deleted'
   except Exception:receipt.update(cleanup='failed',sandboxId=sandbox.id)
  receipt['totalSeconds']=round(time.monotonic()-started,3);(destination/'daytona-receipt.json').write_text(json.dumps(receipt,indent=2))
 return receipt
