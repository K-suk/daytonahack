"""90s bounded integration gate. Saved acquisition is explicitly partial, never live E2E."""
import argparse,json,time,signal,os
from pathlib import Path
from dotenv import load_dotenv
from schema import Recipe,Deal,Conditions,eligible_recipe
from graph import ingest_and_query
from inference import select
from calculation import calculate
A=Path(__file__).parent/'artifacts'
def main():
 p=argparse.ArgumentParser();p.add_argument('--days',type=int,choices=[1,7],default=1);p.add_argument('--diagnostic-selection',action='store_true');p.add_argument('--conditions',type=Path);args=p.parse_args();load_dotenv(A.parent.parent/'.env')
 conditions=Conditions.model_validate_json(args.conditions.read_text()) if args.conditions else Conditions()
 start=time.monotonic();events=[];result={'status':'failed','threeProductLiveSuccess':False,'acquisition':'saved','requestedDays':args.days}
 def event(stage,status,**kw):
  row={'stage':stage,'status':status,'elapsedSeconds':round(time.monotonic()-start,3),**kw};events.append(row);print(json.dumps(row),flush=True)
 def timeout(*_):raise TimeoutError('global_90s_deadline')
 old=signal.signal(signal.SIGALRM,timeout);signal.setitimer(signal.ITIMER_REAL,90)
 try:
  data=json.loads((A/'sample-data.json').read_text());foods=json.loads((A/'nutrition.json').read_text())
  for r in data['recipes']:Recipe.model_validate(r)
  for d in data['deals']:Deal.model_validate(d)
  event('acquisition','saved',daytonaLive='blocked_by_tier_1')
  graph=ingest_and_query(data,'validation-20260912-v2',conditions.shoppingDate,conditions.pantry);event('aura','success',candidateRows=len(graph['candidates']))
  result['graph']=graph
  candidates=graph['candidates']
  if not args.diagnostic_selection:
   eligible={r['id'] for r in data['recipes'] if eligible_recipe(Recipe.model_validate(r),conditions)}
   candidates=[c for c in candidates if c['recipeId'] in eligible]
  if not candidates:raise ValueError('no_fully_verified_30min_candidates')
  if not os.getenv('NOSANA_INFERENCE_BASE_URL'):raise RuntimeError('nosana_endpoint_not_ready')
  selection=select(candidates,conditions.model_dump(),args.days,min(start+85,time.monotonic()+25));event('nosana','success');result['nosana']=selection
  by_id={r['id']:r for r in data['recipes']};meals=[]
  for item in selection['selection']['days']:
   r=by_id[item['recipeId']];meal={'rice-cooked':150}
   for q in r['requirements']:
    grams=q['grams']*item['servings']/r['servings'] if q['grams'] is not None and r['servings'] else None
    iid=q['ingredientId'];meal[iid]=None if grams is None or (iid in meal and meal[iid] is None) else meal.get(iid,0)+grams
   meals.append(meal)
  # The real flyer lacks pack weights. Do not turn 100g unit prices into packs.
  offers={d['ingredientId']:{**d,'basis':d['evidence']['basis'],'sourceUrl':d['evidence']['sourceUrl'],'conditionsVerified':True} for d in data['deals'] if d['storeId']=='seijo-minamiaoyama'}
  result['calculation']=calculate(meals,foods,offers,conditions.pantry,conditions.shoppingDate,conditions.budgetYen,{'protein':conditions.proteinGoalG,'kcal':conditions.kcalGoal});event('calculation','success')
  result['status']='partial_diagnostic';result['limitations']=['Daytona live acquisition blocked','30min and exclusions not fully validated','unknown packs, conversions and nutrition','not a valid final dinner plan']
 except Exception as e:
  result['error']=type(e).__name__;result['reason']=str(e) if type(e) in (ValueError,RuntimeError,TimeoutError) else 'see component probe';event('pipeline','failed',error=result['reason'])
 finally:
  signal.setitimer(signal.ITIMER_REAL,0);signal.signal(signal.SIGALRM,old)
  result['seconds']=round(time.monotonic()-start,3);result['events']=events
  (A/f'result-{args.days}day.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  print(json.dumps({'status':result['status'],'seconds':result['seconds']}))
if __name__=='__main__':main()
