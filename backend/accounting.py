"""Per-value provenance adapter around deterministic accounting. No estimates generated."""
import sys,math
from pathlib import Path
from typing import Literal
from pydantic import BaseModel,ConfigDict,model_validator,Field
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'validation'))
from calculation import calculate,MACROS
class Quantity(BaseModel):
 model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
 value:float|None=Field(ge=0)
 basis:Literal['source','estimated','unknown']
 sourceUrl:str|None=None
 sourceDocumentId:str|None=None
 reason:str|None=None
 @model_validator(mode='after')
 def evidence(self):
  if self.basis=='unknown' and self.value is not None:raise ValueError('unknown must be null')
  if self.basis!='unknown' and (self.value is None or not (self.sourceUrl or self.sourceDocumentId)):raise ValueError('value and source required')
  if self.basis=='estimated' and not self.reason:raise ValueError('estimation reason required')
  return self

def calculate_evidenced(meals,foods,offers,pantry,shopping_date,budget,targets=None):
 provenance={}
 def unpack(raw,path):
  q=Quantity.model_validate(raw);provenance[path]=q.model_dump();return q.value
 plain_meals=[{iid:unpack(q,f'meals/{day}/{iid}') for iid,q in meal.items()} for day,meal in enumerate(meals)]
 plain_foods={iid:{k:unpack(f[k],f'foods/{iid}/{k}') for k in MACROS} for iid,f in foods.items()}
 plain_offers={}
 for iid,o in offers.items():
  if o.get('priceKind')!='pack':raise ValueError('pack_price_required_unit_price_not_convertible')
  p={k:v for k,v in o.items() if k not in ['priceYen','packGrams','comparisonPriceYen']}
  for k in ['priceYen','packGrams','comparisonPriceYen']:
   if k in o:p[k]=unpack(o[k],f'offers/{iid}/{k}')
  qs=[provenance[f'offers/{iid}/{k}'] for k in ['priceYen','packGrams'] if f'offers/{iid}/{k}' in provenance]
  p['basis']='estimated' if any(q['basis']=='estimated' for q in qs) else 'source'
  p['sourceUrl']=o.get('priceYen',{}).get('sourceUrl');plain_offers[iid]=p
 result=calculate(plain_meals,plain_foods,plain_offers,pantry,shopping_date,budget,targets)
 estimated_weight=any(q['basis']=='estimated' for path,q in provenance.items() if path.startswith('meals/') and path.split('/')[2] not in pantry)
 if result['totalYen'] is not None and estimated_weight:result['totalBasis']='estimated'
 result['nutritionBasis']={k:'unknown' if result['weeklyNutrition'][k] is None else 'estimated' if any(q['basis']=='estimated' for path,q in provenance.items() if path.startswith('meals/') or (path.startswith('foods/') and path.endswith('/'+k))) else 'source' for k in MACROS}
 result['provenance']=provenance
 return result
