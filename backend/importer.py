import json
from pathlib import Path
from pydantic import BaseModel,ConfigDict
from materials import load_manifest,local_file
from normalize import normalize,A
from schema import Deal,Recipe
from accounting import Quantity
from daytona_saved import extract_documents
class Confirmed(BaseModel):
 model_config=ConfigDict(extra='forbid')
 deals:list[Deal]=[]
 recipes:list[Recipe]=[]
 foods:dict[str,dict[str,Quantity]]={}

def import_documents(destination,emit):
 manifest=load_manifest();documents=manifest.documents
 receipt=extract_documents([(d,local_file(d)) for d in documents],destination,emit)
 rows=json.loads((destination/'daytona-documents.json').read_text());byid={d.documentId:d for d in documents}
 if {r['documentId'] for r in rows}!={d.documentId for d in documents}:raise ValueError('remote_document_set_mismatch')
 expected={d.documentId:d.contentHash for d in documents}
 if {r['documentId']:r['sha256'] for r in receipt['inputs']}!=expected:raise ValueError('upload_hash_mismatch')
 deals=[];facts=[];confirmed_recipes=[];document_status=[];foods={}
 for row in rows:
  doc=byid[row['documentId']];emit('document.parsed','complete',documentId=doc.documentId,method=row['method'])
  if row['format']=='html':
   if doc.kind!='recipe':raise ValueError('store_html_parser_unsupported')
   for fact in row['recipes']:
    if not fact.get('url'):fact['url']=doc.sourceUrl
    if not fact['url'] or fact['url'].rstrip('/').split('/')[-1]!=doc.recipeSourceId:raise ValueError('recipe_source_mismatch')
    facts.append(fact)
  elif row['format']=='json':
   parsed=Confirmed.model_validate(row['confirmed'])
   if any(set(f)!= {'kcal','protein','fat','carbs'} for f in parsed.foods.values()):raise ValueError('nutrition_requires_four_macros_use_unknown_null')
   foods.update({iid:{k:q.model_dump() for k,q in f.items()} for iid,f in parsed.foods.items()})
   for deal in parsed.deals:
    if deal.storeId!=doc.storeId:raise ValueError('deal_store_mismatch')
    deals.append(deal.model_dump());emit('deal.validated','complete',documentId=doc.documentId,dealId=deal.id,method='confirmed_json_not_image_ocr')
   for recipe in parsed.recipes:
    if recipe.id!=doc.recipeSourceId:raise ValueError('recipe_source_mismatch')
    from urllib.parse import urlparse
    if urlparse(recipe.sourceUrl).hostname not in ['cookpad.com','www.cookpad.com'] or recipe.sourceUrl.rstrip('/').split('/')[-1]!=recipe.id:raise ValueError('cookpad_only')
    recipe.evidence.route='saved'
    confirmed_recipes.append(recipe.model_dump())
  document_status.append({'documentId':doc.documentId,'method':row['method'],'previewUrl':f'/api/documents/{doc.documentId}/preview','previewLabel':'Source preview'})
 fixed=json.loads((A/'sample-data.json').read_text())
 base={'stores':fixed['stores'],'ingredients':[{'id':d['ingredientId'],'nameJa':d['productName'],'nameEn':None} for d in deals],'deals':deals}
 data=normalize(facts,receipt,documents,base)
 data['recipes']+=confirmed_recipes
 if len({r['id'] for r in data['recipes']})!=len(data['recipes']):raise ValueError('duplicate_recipe')
 data['originalExtractedRecipes']=json.loads(json.dumps(data['recipes']));data['supplements']=[];data['measurements']={};data['foods']=foods;data['originalExtractedDeals']=json.loads(json.dumps(deals))
 seen_supplements=set()
 for doc in documents:
  for supplement in doc.supplements:
   key=(supplement.targetId,supplement.field)
   if key in seen_supplements:raise ValueError('duplicate_supplement_field')
   seen_supplements.add(key)
   v=supplement.model_dump(mode='json');data['supplements'].append(v);target=next((r for r in data['recipes'] if r['id']==supplement.targetId),None)
   if target is None:
    deal=next((d for d in data['deals'] if d['id']==supplement.targetId),None)
    if deal is None or supplement.field not in ['priceYen','packGrams','assumedPurchaseGrams']:raise ValueError('supplement_target_or_field_invalid')
    q=Quantity(value=supplement.value,basis=supplement.basis,sourceUrl=supplement.sourceUrl or doc.sourceUrl,sourceDocumentId=doc.documentId,reason=supplement.reason)
    if supplement.field=='assumedPurchaseGrams' and q.basis!='estimated':raise ValueError('assumed_weight_must_be_estimated')
    data['measurements'][f'deal/{deal["id"]}/{supplement.field}']=q.model_dump()
    continue
   if supplement.field in ['cookingMinutes','servings']:
    q=Quantity(value=supplement.value,basis=supplement.basis,sourceUrl=supplement.sourceUrl or doc.sourceUrl,sourceDocumentId=doc.documentId,reason=supplement.reason);target[supplement.field]=q.value
   elif supplement.field in ['allergens','exclusionReviewed']:
    if supplement.basis!='source':raise ValueError('exclusion_cannot_be_estimated')
    target[supplement.field]=supplement.value
   elif supplement.field.startswith('grams:'):
    iid=supplement.field.split(':',1)[1];qs=[q for q in target['requirements'] if q['ingredientId']==iid]
    if len(qs)!=1:raise ValueError('ambiguous_supplement_ingredient')
    q=Quantity(value=supplement.value,basis=supplement.basis,sourceUrl=supplement.sourceUrl or doc.sourceUrl,sourceDocumentId=doc.documentId,reason=supplement.reason);qs[0]['grams']=q.value;qs[0]['conversionSource']=q.sourceUrl
   else:raise ValueError('unsupported_supplement_field')
   Recipe.model_validate(target)
   if supplement.field not in ['allergens','exclusionReviewed']:data['measurements'][f'recipe/{target["id"]}/{supplement.field}']=q.model_dump()
 for r in data['recipes']:
  emit('recipe.parsed','complete',recipeId=r['id'])
  for q in r['requirements']:
   if not any(i['id']==q['ingredientId'] for i in data['ingredients']):data['ingredients'].append({'id':q['ingredientId'],'nameJa':q['nameJa'],'nameEn':None})
 data['documents']=document_status
 (destination/'normalized.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
 return data
