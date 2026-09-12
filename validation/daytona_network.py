import json,time
from pathlib import Path
from dotenv import load_dotenv
from daytona import Daytona,CreateSandboxFromSnapshotParams
load_dotenv('.env');d=Daytona();s=None
try:
 s=d.create(CreateSandboxFromSnapshotParams(language='python',auto_stop_interval=3,auto_delete_interval=5,ttl_minutes=8),timeout=45)
 code='''import requests,os,json
print(json.dumps({'proxyVarsPresent':{k:bool(os.getenv(k)) for k in ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']}}))
for u in ['https://www.daytona.io','https://cookpad.com/jp/recipes/21691824','https://www.e-kinokuniya.com/store/KINOKUNIYA/international']:
 try:
  r=requests.get(u,timeout=8);print(json.dumps({'url':u,'status':r.status_code,'bytes':len(r.content)}))
 except Exception as e:print(json.dumps({'url':u,'error':type(e).__name__,'detail':str(e)[:300]}))
'''
 s.fs.upload_file(code.encode(),'/tmp/network.py');r=s.process.exec('python /tmp/network.py',timeout=30)
 Path('validation/artifacts/daytona-network.txt').write_text(r.result);print(r.result)
finally:
 if s:d.delete(s,timeout=30,wait=True)
