"""Deterministic accounting. Missing facts remain unknown; no model arithmetic."""
from collections import defaultdict
from decimal import Decimal,ROUND_CEILING
from datetime import date
MACROS=('kcal','protein','fat','carbs')
def dec(x):return Decimal(str(x))
def calculate(meals,foods,offers,pantry,shopping_date,budget,targets=None):
 date.fromisoformat(shopping_date)
 used=defaultdict(Decimal);unknown=[];daily=[]
 for index,meal in enumerate(meals,1):
  total={k:Decimal(0) for k in MACROS};missing=set()
  for ingredient,grams in meal.items():
   if grams is None:
    unknown.append(f'day{index}:{ingredient}:quantity');missing.update(MACROS);used[ingredient]+=0;continue
   if dec(grams)<0:raise ValueError('negative_quantity')
   used[ingredient]+=dec(grams)
   f=foods.get(ingredient)
   for k in MACROS:
    if not f or f.get(k) is None:missing.add(k);unknown.append(f'day{index}:{ingredient}:{k}')
    else:total[k]+=dec(f[k])*dec(grams)/100
  daily.append({k:None if k in missing else float(round(total[k],3)) for k in MACROS})
 shopping=[];known=Decimal(0);complete=True;estimated=False
 unknown_ingredients={x.split(':')[1] for x in unknown if x.endswith(':quantity')}
 for ingredient,grams in used.items():
  if ingredient in pantry:continue
  o=offers.get(ingredient);line={'ingredientId':ingredient,'usedGrams':None if ingredient in unknown_ingredients else float(grams),'packs':None,'costYen':None}
  valid=o and o.get('validFrom') and o.get('validTo') and o['validFrom']<=shopping_date<=o['validTo']
  if ingredient in unknown_ingredients or not valid or o.get('priceYen') is None or not o.get('packGrams') or o.get('tax')!='included' or o.get('conditionsVerified') is not True:
   complete=False;line['status']='unknown_price_or_pack_or_conditions';shopping.append(line);continue
  packs=int((grams/dec(o['packGrams'])).to_integral_value(rounding=ROUND_CEILING));cost=packs*dec(o['priceYen']);known+=cost
  estimated|=o.get('basis')!='source'
  line.update(packs=packs,purchasedGrams=float(packs*dec(o['packGrams'])),costYen=float(cost),status=o.get('basis','unknown'),sourceUrl=o.get('sourceUrl'),savedYen=None)
  if o.get('comparisonPriceYen') is not None:line['savedYen']=float(packs*(dec(o['comparisonPriceYen'])-dec(o['priceYen'])))
  shopping.append(line)
 weekly={k:None if any(d[k] is None for d in daily) else round(sum(d[k] for d in daily),3) for k in MACROS}
 target_status=[]
 for i,d in enumerate(daily,1):
  target_status.append({'day':i,**{k:('unknown' if d.get(k) is None else 'unmet' if d[k]<v else 'met') for k,v in (targets or {}).items()}})
 return {'shopping':shopping,'dailyNutrition':daily,'weeklyNutrition':weekly,'knownSubtotalYen':float(known),'totalYen':float(known) if complete else None,'totalBasis':'unknown' if not complete else 'estimated' if estimated else 'source','budgetStatus':'over' if known>dec(budget) else 'unknown' if not complete else 'within','nutritionTargets':target_status,'unknowns':sorted(set(unknown))}
