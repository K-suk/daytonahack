import json,time
from pathlib import Path
from dotenv import load_dotenv
from graph import ingest_and_query
load_dotenv('.env');a=Path('validation/artifacts');t=time.monotonic()
try:
 result=ingest_and_query(json.loads((a/'sample-data.json').read_text()),'validation-20260912-v2','2026-09-12',['rice-cooked','oil','salt','pepper','soy-sauce','sugar']);result['status']='success'
except Exception as e:result={'status':'failed','error':type(e).__name__,'code':getattr(e,'code',None),'detail':str(e).split('password')[0][:250]}
result['seconds']=round(time.monotonic()-t,3);(a/'aura-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print({k:v for k,v in result.items() if k not in ['candidates','commonIngredients']})
