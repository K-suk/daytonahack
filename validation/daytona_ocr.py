"""Saved flyer OCR on Daytona. OCR tokens are NOT verified deals."""
from pathlib import Path
from dotenv import load_dotenv
from daytona import Daytona,CreateSandboxFromSnapshotParams
import time,json
A=Path(__file__).parent/'artifacts';load_dotenv(A.parent.parent/'.env');d=Daytona();s=None;t=time.monotonic();out={'route':'saved','processedIn':'daytona','method':'tesseract jpn+eng psm11','verifiedDeals':0}
try:
 s=d.create(CreateSandboxFromSnapshotParams(language='python',auto_stop_interval=3,auto_delete_interval=5,ttl_minutes=6),timeout=30)
 r=s.process.exec('sudo apt-get update -qq && sudo apt-get install -y tesseract-ocr tesseract-ocr-jpn',timeout=100)
 if r.exit_code!=0:raise RuntimeError('ocr_install_failed')
 out['setupSeconds']=round(time.monotonic()-t,3);s.fs.upload_file(str(A/'seijo-flyer.bin'),'/tmp/flyer.jpg')
 t2=time.monotonic();r=s.process.exec('tesseract /tmp/flyer.jpg /tmp/flyer -l jpn+eng --psm 11 tsv',timeout=40)
 if r.exit_code!=0:raise RuntimeError('ocr_failed')
 s.fs.download_file('/tmp/flyer.tsv',str(A/'daytona-flyer-ocr.tsv'));out.update(status='success',ocrSeconds=round(time.monotonic()-t2,3))
except Exception as e:out.update(status='failed',error=type(e).__name__)
finally:
 if s:
  try:d.delete(s,timeout=30,wait=True);out['cleanup']='deleted'
  except Exception:out.update(cleanup='failed',sandboxId=s.id)
 out['totalSeconds']=round(time.monotonic()-t,3);(A/'daytona-ocr-result.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
