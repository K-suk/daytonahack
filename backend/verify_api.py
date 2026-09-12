"""One real saved run. Does not deploy Nosana or perform live browsing/OCR."""
import requests,json,time
from pathlib import Path
base='http://127.0.0.1:8787'
assert requests.get(base+'/api/health',timeout=5).status_code==200
r=requests.post(base+'/api/runs',json={'days':7,'conditions':{'shoppingDate':'2026-09-12'}},timeout=5);r.raise_for_status();rid=r.json()['runId'];checks={'runId':rid,'startStatus':r.status_code}
checks['concurrentStartStatus']=requests.post(base+'/api/runs',json={},timeout=5).status_code
for _ in range(60):
 body=requests.get(base+f'/api/runs/{rid}/events',timeout=5).json()
 if body['status']!='running':break
 time.sleep(1)
result=requests.get(base+f'/api/runs/{rid}/result',timeout=5).json();checks.update(events=body,result=result)
checks['swapStatus']=requests.post(base+f'/api/runs/{rid}/swap',json={'day':0,'recipeId':'invented','revision':0},timeout=5).status_code
checks['unknownRunStatus']=requests.get(base+'/api/runs/00000000-0000-0000-0000-000000000000/result',timeout=5).status_code
checks['corsOrigin']=requests.get(base+'/api/health',headers={'Origin':'http://127.0.0.1:4312'},timeout=5).headers.get('Access-Control-Allow-Origin')
Path('backend/api-verification.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
print(json.dumps({'runId':rid,'status':result['status'],'stopReasons':result.get('stopReasons'),'candidateCount':len(result.get('graph',{}).get('candidates',[]))}),flush=True)
assert result['status']=='blocked' and len(result['graph']['candidates'])==3
assert result['route']=='saved' and not result['liveFetchSuccess']
assert result['nosana']['status']=='unconnected' and checks['swapStatus']==409
assert checks['corsOrigin']=='http://127.0.0.1:4312'
