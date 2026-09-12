"""Public evidence fetcher; no login, bypass, credentials, or generated facts."""
import argparse, concurrent.futures, hashlib, json, time
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
OUT=Path(__file__).parent/'artifacts'
def fetch(item):
 name,url=item; t=time.monotonic(); out={'name':name,'sourceUrl':url,'fetchedAt':datetime.now(timezone.utc).isoformat(),'environment':'local','route':'live'}
 try:
  r=requests.get(url,timeout=(5,20),headers={'User-Agent':'HackathonTechnicalValidation/0.1'},allow_redirects=True)
  out.update(statusCode=r.status_code,finalUrl=r.url,contentType=r.headers.get('content-type'),bytes=len(r.content),sha256=hashlib.sha256(r.content).hexdigest())
  suffix='.html' if 'html' in r.headers.get('content-type','') else '.bin'
  (OUT/(name+suffix)).write_bytes(r.content)
  if suffix=='.html':
   soup=BeautifulSoup(r.content,'html.parser')
   out['links']=[{'text':a.get_text(' ',strip=True)[:100],'url':urljoin(r.url,a['href'])} for a in soup.select('a[href]')]
   out['images']=[urljoin(r.url,a['src']) for a in soup.select('img[src]')]
   for x in soup(['script','style']): x.decompose()
   (OUT/(name+'.txt')).write_text(soup.get_text('\n',strip=True))
  out['status']='success' if r.status_code==200 else 'failed'
 except Exception as e: out.update(status='failed',error=type(e).__name__)
 out['seconds']=round(time.monotonic()-t,3)
 (OUT/(name+'.metadata.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2))
 return {k:v for k,v in out.items() if k not in ('links','images')}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('pairs',nargs='+',help='name=url');a=p.parse_args();OUT.mkdir(exist_ok=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for result in pool.map(fetch,[x.split('=',1) for x in a.pairs]): print(json.dumps(result,ensure_ascii=False))
