"""One disposable sandbox, explicit --create flag; only deletes sandbox created here."""
import argparse,json,time,shlex,os
from pathlib import Path
from dotenv import load_dotenv
from daytona import Daytona,CreateSandboxFromSnapshotParams
ROOT=Path(__file__).parent

def run():
 load_dotenv(ROOT.parent/'.env');a=argparse.ArgumentParser();a.add_argument('--create',action='store_true');args=a.parse_args()
 if not args.create:raise SystemExit('Pass --create only after credit/budget approval')
 d=Daytona();s=None;events=[];t=time.monotonic()
 def log(stage,status,**extra):
  row={'stage':stage,'status':status,'elapsedSeconds':round(time.monotonic()-t,3),**extra};events.append(row);print(json.dumps(row),flush=True);(ROOT/'artifacts/daytona-run.json').write_text(json.dumps(events,indent=2))
 try:
  s=d.create(CreateSandboxFromSnapshotParams(language='python',name='meal-validation-'+str(int(time.time())),auto_stop_interval=5,auto_delete_interval=10,ttl_minutes=20),timeout=60)
  log('create','success',sandboxId=s.id)
  s.fs.upload_file(str(ROOT/'browser_probe.py'),'/tmp/browser_probe.py')
  start=time.monotonic();r=s.process.exec('python -m pip install playwright && python -m playwright install --with-deps chromium',timeout=180)
  log('browser-setup','success' if r.exit_code==0 else 'failed',seconds=round(time.monotonic()-start,3))
  if r.exit_code!=0:return
  urls=[('seijo','https://shop.seijoishii.com/seijoishii/spot/detail?code=0150'),('kino','https://www.e-kinokuniya.com/store/KINOKUNIYA/international'),('ville','https://page.line.me/kaq2977y'),('cookpad','https://cookpad.com/jp/recipes/21691824')]
  for name,url in urls:
   r=s.process.exec('python /tmp/browser_probe.py '+shlex.quote(url)+' /tmp/'+name,timeout=45)
   for ext in ['png','txt','html','json']:
    try:s.fs.download_file('/tmp/'+name+'.'+ext,str(ROOT/'artifacts'/('daytona-'+name+'.'+ext)))
    except Exception:pass
   meta=ROOT/'artifacts'/('daytona-'+name+'.json')
   outcome=json.loads(meta.read_text()) if meta.exists() else {'status':'failed'}
   log('fetch-'+name,outcome.get('status','failed'),seconds=outcome.get('seconds'))
 except Exception as e:log('probe','failed',error=type(e).__name__)
 finally:
  if s:
   try:d.delete(s,timeout=30,wait=True);log('cleanup','deleted')
   except Exception as e:log('cleanup','failed',error=type(e).__name__,sandboxId=s.id)
if __name__=='__main__':run()
