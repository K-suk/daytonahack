"""Same fixed browser probe runs locally and inside Daytona. No autonomous agent claims."""
import argparse,json,time
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright

def capture(url,out,channel=None):
 t=time.monotonic();folder=Path(out);folder.parent.mkdir(parents=True,exist_ok=True)
 result={'sourceUrl':url,'fetchedAt':datetime.now(timezone.utc).isoformat(),'route':'live'}
 with sync_playwright() as p:
  opts={'headless':True}
  if channel: opts['channel']=channel
  browser=p.chromium.launch(**opts)
  page=browser.new_page(viewport={'width':1440,'height':1000},locale='ja-JP')
  try:
   response=page.goto(url,wait_until='domcontentloaded',timeout=20000)
   page.wait_for_timeout(1500)
   result.update(statusCode=response.status if response else None,title=page.title(),finalUrl=page.url)
   page.screenshot(path=str(folder)+'.png',full_page=False,timeout=10000)
   Path(str(folder)+'.html').write_text(page.content())
   Path(str(folder)+'.txt').write_text(page.locator('body').inner_text(timeout=5000))
   result['status']='success' if response and response.status==200 else 'failed'
  except Exception as e: result.update(status='failed',error=type(e).__name__,detail=str(e)[:700])
  finally: browser.close()
 result['seconds']=round(time.monotonic()-t,3)
 Path(str(folder)+'.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 return result
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('url');a.add_argument('out');a.add_argument('--channel');x=a.parse_args();print(json.dumps(capture(x.url,x.out,x.channel),ensure_ascii=False))
