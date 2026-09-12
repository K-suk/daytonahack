"""Eligibility, deterministic full-basket calculation, and revision-checked swap."""
import json
from pathlib import Path
from accounting import calculate_evidenced,Quantity
from calculation import MACROS
A=Path(__file__).resolve().parents[1]/'validation/artifacts'
def source(value,url):return dict(value=value,basis='unknown' if value is None else 'source',sourceUrl=None if value is None else url,reason=None)
def foods_for(data):
 return {**{iid:{k:source(f.get(k),f['sourceUrl']) for k in MACROS} for iid,f in json.loads((A/'nutrition.json').read_text()).items()},**data.get('foods',{})}
def deficiencies(data,conditions):
 foods=foods_for(data);out=[]
 for r in data['recipes']:
  issues=[]
  def add(field,status,**kw):issues.append(dict(field=field,status=status,**kw))
  if r['cookingMinutes'] is None:add('cookingMinutes','unknown')
  elif r['cookingMinutes']>30:add('cookingMinutes','unmet',limit=30)
  if r['servings'] is None:add('servings','unknown')
  if not r.get('exclusionReviewed'):add('exclusionReviewed','unknown')
  if set(r.get('allergens',[]))&set(conditions.allergies):add('allergies','unmet')
  for q in r['requirements']:
   iid=q['ingredientId']
   if q['grams'] is None:add('grams','unknown',ingredientId=iid,raw=q['raw'])
   if iid in conditions.dislikes:add('dislikes','unmet',ingredientId=iid)
   for k in MACROS:
    if foods.get(iid,{}).get(k,{}).get('value') is None:add('nutrition.'+k,'unknown',ingredientId=iid)
  out.append(dict(recipeId=r['id'],eligible=not issues,issues=issues))
 return out

def calculate_plan(data,selection,conditions):
 recipes={r['id']:r for r in data['recipes']};meals=[]
 for day in selection['days']:
  if day['servings']!=1:raise ValueError('one_person_serving_required')
  r=recipes[day['recipeId']];meal={}
  for q in r['requirements']:
   value=None if q['grams'] is None or not r['servings'] else q['grams']/r['servings']
   ev=data.get('measurements',{}).get(f"recipe/{r['id']}/grams:{q['ingredientId']}",source(value,r['sourceUrl']))
   ev=dict(ev,value=value)
   if q['ingredientId'] in meal:
    prev=meal[q['ingredientId']];ev['value']=None if value is None or prev['value'] is None else prev['value']+value
    if prev['basis']=='estimated':ev=dict(prev,value=ev['value'])
   meal[q['ingredientId']]=ev
  # Existing MVP portion assumption, explicit and editable via future meal model.
  if 'rice-cooked' not in meal:meal['rice-cooked']=dict(value=150,basis='estimated',sourceUrl='local:meal-policy',reason='Existing MVP default: 150g cooked rice per dinner')
  meals.append(meal)
 options=[]
 for store in data['stores']:
  offers={}
  for d in data['deals']:
   if d['storeId']!=store['id']:continue
   ev=data.get('measurements',{});url=d['evidence']['sourceUrl'];price=ev.get(f"deal/{d['id']}/priceYen",source(d['priceYen'],url));weight=ev.get(f"deal/{d['id']}/packGrams",source(d['packGrams'],url));assumed=ev.get(f"deal/{d['id']}/assumedPurchaseGrams")
   if assumed and d['unit']=='g' and d['quantity'] and d['priceYen'] is not None:
    weight=dict(assumed,basis='estimated');price=dict(value=d['priceYen']*weight['value']/d['quantity'],basis='estimated',sourceUrl=url,reason='Unit price multiplied by explicitly assumed purchase weight; not observed pack price')
   offers[d['ingredientId']]=dict(priceKind='pack',priceYen=price,packGrams=weight,tax=d['tax'],validFrom=d['validFrom'],validTo=d['validTo'],conditionsVerified=d.get('membershipRequired') is False,comparisonPriceYen=source(d.get('comparisonPriceYen'),url))
  result=calculate_evidenced(meals,foods_for(data),offers,conditions.pantry,conditions.shoppingDate,conditions.budgetYen,{'protein':conditions.proteinGoalG,'kcal':conditions.kcalGoal});options.append(dict(store=store,**result))
 best=min(options,key=lambda x:(x['totalYen'] is None,x['totalYen'] if x['totalYen'] is not None else float('inf')))
 return dict(selection=selection,meals=[dict(day=d['day'],recipeId=d['recipeId'],nutrition=best['dailyNutrition'][i]) for i,d in enumerate(selection['days'])],shopping=best,comparisons=[],comparisonStatus='no_verified_like_for_like_comparison')

def alternatives(result):
 if not result.get('mealPlan'):raise ValueError('meal_plan_not_available')
 ids={r['recipeId'] for r in result['eligibility'] if r['eligible']};selected={d['recipeId'] for d in result['mealPlan']['selection']['days']}
 return [r for r in result['recipes'] if r['id'] in ids-selected]
def swap(result,day_index,recipe_id,revision):
 from schema import Conditions
 if not result.get('mealPlan'):raise ValueError('meal_plan_not_available')
 if revision!=result['revision']:raise ValueError('revision_conflict')
 if recipe_id not in {r['id'] for r in alternatives(result)}:raise ValueError('alternative_not_available')
 selected=json.loads(json.dumps(result['mealPlan']['selection']))
 if not 0<=day_index<len(selected['days']):raise ValueError('invalid_day')
 selected['days'][day_index].update(recipeId=recipe_id,reason='User selected an imported alternative')
 plan=calculate_plan(result,selected,Conditions.model_validate(result['conditions']))
 updated=dict(result,mealPlan=plan,revision=revision+1)
 updated['status']='complete' if plan['shopping']['totalYen'] is not None else 'blocked'
 updated['stopReasons']=[] if updated['status']=='complete' else ['purchase_price_or_weight_unknown']
 return updated


def optimize_budget(data,selection,conditions):
 """Bounded deterministic improvement; never claim a global optimum."""
 plan=calculate_plan(data,selection,conditions)
 eligible={x['recipeId'] for x in deficiencies(data,conditions) if x['eligible']}
 for _ in range(2):
  cost=plan['shopping']['totalYen']
  if cost is None or cost<=conditions.budgetYen:break
  best=plan
  for i in range(len(plan['selection']['days'])):
   for rid in sorted(eligible):
    candidate=json.loads(json.dumps(plan['selection']));candidate['days'][i].update(recipeId=rid,reason='Budget adjustment using imported eligible candidate')
    trial=calculate_plan(data,candidate,conditions);amount=trial['shopping']['totalYen']
    if amount is not None and amount<best['shopping']['totalYen']:best=trial
  if best is plan:break
  plan=best
 plan['budgetOptimization']='bounded_two_passes_not_global_optimum'
 return plan
