"""Normalize only Daytona-extracted recipes; never refill from local recipe fixtures."""
import hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'validation'))
from schema import Recipe,Deal
A=ROOT/'validation/artifacts'
ALIASES={'ブロッコリー':('broccoli-raw','broccoli, raw florets'),'豚こま切れ肉':('pork-mixed-cut-raw','pork mixed cuts, raw'),'豚肉':('pork-unspecified-raw','pork, cut unspecified, raw'),'玉ねぎ':('onion-raw','onion, raw'),'バター':('butter','butter'),'醤油':('soy-sauce','soy sauce'),'酒':('sake','cooking sake'),'塩':('salt','salt'),'胡椒':('pepper','pepper')}
def normalize(extracted,receipt,source_documents=None,base_data=None):
 if receipt.get('status')!='success' or receipt.get('route')!='saved':raise ValueError('daytona_saved_not_successful')
 metas={}
 if source_documents is not None:
  for d in source_documents:
   if d.sourceUrl:metas[d.sourceUrl]={'finalUrl':d.sourceUrl,'fetchedAt':d.obtainedAt.isoformat()}
 else:
  for entry in receipt['inputs']:
   name=entry['name'];raw=(A/(name+'.html')).read_bytes()
   if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise ValueError('source_hash_mismatch')
   m=json.loads((A/(name+'.metadata.json')).read_text());metas[m['finalUrl']]=m
 base=base_data if base_data is not None else json.loads((A/'sample-data.json').read_text());ingredients={x['id']:x for x in base['ingredients'] if any(d['ingredientId']==x['id'] for d in base['deals'])};recipes=[];ids=set()
 for fact in extracted:
  url=fact['url'];meta=metas[url];rid=url.rstrip('/').split('/')[-1]
  if rid in ids:raise ValueError('duplicate_recipe')
  ids.add(rid);requirements=[]
  for raw in fact['recipeIngredient']:
   name,_,qty=raw.partition(' ');iid,en=ALIASES.get(name,('unmapped-'+hashlib.sha256(name.encode()).hexdigest()[:12],None));ingredients[iid]={'id':iid,'nameJa':name,'nameEn':en}
   m=re.fullmatch(r'(\d+(?:\.\d+)?)(g|kg)',qty);grams=float(m[1])*(1000 if m[2]=='kg' else 1) if m else None
   requirements.append(dict(ingredientId=iid,nameJa=name,raw=raw,amount=float(m[1]) if m else None,unit=m[2] if m else None,grams=grams,conversionSource=url if m else None))
  yieldraw=str(fact.get('recipeYield',''));m=re.fullmatch(r'(?:たっぷり)?(\d+)人分',yieldraw)
  recipes.append(Recipe(id=rid,title=fact['name'],sourceUrl=url,evidence=dict(route='saved',basis='source',sourceUrl=url,fetchedAt=meta['fetchedAt'],environment='daytona'),servings=int(m[1]) if m else None,servingsRaw=yieldraw,cooksnapCount=fact.get('commentCount'),requirements=requirements).model_dump())
 # Empty imports are legitimate partial runs.
 for deal in base['deals']:Deal.model_validate(deal)
 return dict(stores=base['stores'],deals=base['deals'],ingredients=list(ingredients.values()),recipes=recipes,route='saved',liveFetchSuccess=False,extractionMethod='Daytona JSON-LD; saved visually verified flyer deals')
