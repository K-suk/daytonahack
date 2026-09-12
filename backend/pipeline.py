import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'validation'))
from graph import ingest_and_query
from importer import import_documents
from nosana import choose,connection
from planning import deficiencies,calculate_plan,optimize_budget

def execute(run_id,conditions,days,destination,emit):
 data=import_documents(destination,emit)
 graph=ingest_and_query(data,run_id,conditions.shoppingDate,conditions.pantry)
 emit('graph.queried','complete',candidateCount=len(graph['candidates']),message='Matching ingredients')
 eligibility=deficiencies(data,conditions);eligible={r['recipeId'] for r in eligibility if r['eligible']}
 candidates=list({c['recipeId']:c for c in graph['candidates'] if c['recipeId'] in eligible}.values())
 if candidates and connection()['status']=='ready':emit('selection.started','running',message='Planning dinners')
 nosana=choose(candidates,conditions.model_dump(),days);reasons=[];plan=None
 if not candidates:reasons.append('no_eligible_candidates')
 if nosana['status']!='success':reasons.append(nosana.get('reason','nosana_not_ready'))
 else:
  emit('selection.validated','complete');plan=optimize_budget(data,nosana['selection'],conditions);emit('calculation.completed','complete')
  if plan['shopping']['totalYen'] is None:reasons.append('purchase_price_or_weight_unknown')
 expired=[d['id'] for d in data['deals'] if not d['validFrom'] or not d['validTo'] or not d['validFrom']<=conditions.shoppingDate<=d['validTo']]
 result=dict(data,runId=run_id,status='blocked' if reasons else 'complete',route='saved',liveFetchSuccess=False,threeProductLiveSuccess=False,conditions=conditions.model_dump(),requestedDays=days,graph=graph,nosana=nosana,stopReasons=reasons,mealPlan=plan,revision=0,eligibility=eligibility,missingMaterials={'eligibleRecipeCount':len(eligible),'requestedDays':days,'recipes':eligibility,'expiredOrUndatedDealIds':expired,'storesWithoutDeals':[s['id'] for s in data['stores'] if not any(d['storeId']==s['id'] for d in data['deals'])],'dealsMissingPackWeight':[d['id'] for d in data['deals'] if d['packGrams'] is None]})
 return result
