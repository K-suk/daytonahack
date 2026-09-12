"""Executed inside Daytona only in production. Stdlib, no network/OCR/LLM.
Reuses the existing saved-document upload -> fixed parser -> download boundary.
Tests may import parse(); production never uses a local parse as remote output.
"""
import hashlib,json,math,platform,re,sys,unicodedata
from datetime import date
PARSER_VERSION='1'
def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def text(value):return value.strip() if isinstance(value,str) else ''
def safe_url(value):return value if isinstance(value,str) and re.match(r'^https?://[^\s]+$',value) else None
def canonical(value):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',text(value)).lower()).strip()
def ingredient(name,aliases):
 key=canonical(name)
 for a in aliases:
  if key in [canonical(x) for x in a['aliases']]:
   return {'id':a['id'],'nameJa':a['ja'],'nameEn':a['en'],'category':a['category'],'mapping':'broad' if a.get('broad') else 'exact','allergens':a['allergens'],'allergenReview':'needs_review'}
 # A cut/preparation-qualified ingredient never inherits another cut's ID.
 categories=[a for a in aliases if any(re.search(r'(?<![a-z])'+re.escape(canonical(x))+r'(?![a-z])',key) for x in a['aliases'])]
 category=categories[0]['category'] if categories else None
 allergens=sorted(set(y for a in categories for y in a['allergens']))
 return {'id':'unmapped-'+hashlib.sha256(key.encode()).hexdigest()[:16],'nameJa':None,'nameEn':name,'category':category,'mapping':'broad' if category else 'unmapped','allergens':allergens,'allergenReview':'needs_review'}
def measure(raw):
 s=canonical(raw);m=re.fullmatch(r'(\d+(?:\.\d+)?)\s*(g|grams?|kg|kilograms?|ml|l|tsp|tbsp|cups?|pieces?)',s)
 if not m:return {'amount':None,'unit':None,'grams':None,'fieldEvidence':{'amount':'unknown','unit':'unknown','grams':'unknown'}}
 value=float(m[1]);unit=m[2];unit={'gram':'g','grams':'g','kilogram':'kg','kilograms':'kg','cups':'cup','pieces':'piece'}.get(unit,unit)
 if not math.isfinite(value) or value<=0:return {'amount':None,'unit':None,'grams':None,'fieldEvidence':{'amount':'unknown','unit':'unknown','grams':'unknown'}}
 grams=value*(1000 if unit=='kg' else 1) if unit in ['g','kg'] else None
 return {'amount':value,'unit':unit,'grams':grams,'fieldEvidence':{'amount':'source','unit':'source','grams':'source' if grams is not None else 'unknown'}}
def observation(bundle,record,provider,parse_status,store_id=None):
 data=record['response'].get('data',{}) if provider=='firecrawl' else {};shot=safe_url(data.get('screenshot'))
 return {'runId':bundle['runId'],'provider':provider,'sourceUrl':record['sourceUrl'],'fetchedAt':record['fetchedAt'],'acquisitionMode':record['acquisitionMode'],'acquiredBy':provider,'processedBy':'daytona','contentHash':digest(record['response']),'parseStatus':parse_status,'storeId':store_id,'screenshot':{'url':shot,'acquiredBy':'firecrawl','sourceUrl':record['sourceUrl'],'fetchedAt':record['fetchedAt']} if shot else None,'warnings':[]}
def date_range(line):
 values=[]
 for raw in re.findall(r'\d{4}[/-]\d{1,2}[/-]\d{1,2}',line):
  try:values.append(date.fromisoformat('-'.join(f'{int(n):02d}' if i else n for i,n in enumerate(re.split('[/-]',raw)))).isoformat())
  except ValueError:pass
 return (values[0],values[1]) if len(values)==2 and values[0]<=values[1] else (None,None)
def parse(bundle,input_hash,aliases):
 output={'runId':bundle['runId'],'inputHash':input_hash,'processedBy':'daytona','environment':{'python':platform.python_version(),'platform':platform.system(),'parserVersion':PARSER_VERSION},'stores':bundle['stores'],'deals':[],'recipes':[],'ingredients':[],'observations':[],'warnings':[]};ingredients={};conditions=bundle['conditions'];allergies={canonical(x) for x in conditions['allergies']};dislikes={canonical(x) for x in conditions['dislikes']};seen_recipes=set()
 for record in bundle['pages']:
  data=record['response'].get('data',{});markdown=text(data.get('markdown'));store=next(s for s in bundle['stores'] if s['id']==record['storeId']);obs=observation(bundle,record,'firecrawl','no_products',store['id']);found=[]
  if re.search(r'captcha|access denied|verify (?:that )?you are human|ログインが必要|アクセスが拒否',markdown,re.I):obs['parseStatus']='blocked';output['observations'].append(obs);continue
  for line_no,raw_line in enumerate(markdown.splitlines()):
   line=re.sub(r'[*_`#]','',unicodedata.normalize('NFKC',raw_line))
   price=re.search(r'(?:[¥￥]\s*([\d,]+)|([\d,]+)\s*円)',line)
   if not price:continue
   matches=sorted([(a,alias) for a in aliases for alias in a['aliases'] if canonical(alias) in canonical(line)],key=lambda x:-len(x[1]))
   if not matches:continue
   a,alias=matches[0];i=ingredient(alias,aliases);ingredients[i['id']]=i;price_value=int((price[1] or price[2]).replace(',',''))
   if price_value<=0:continue
   unit_price=re.search(r'(\d+(?:\.\d+)?)\s*(g|kg)\s*(?:当たり|あたり|につき)',line)
   pack=re.search(r'(\d+(?:\.\d+)?)\s*(g|kg)\s*(?:入り|入|/パック|パック)',line)
   quantity=float((unit_price or pack)[1]) if unit_price or pack else None;unit=(unit_price or pack)[2] if unit_price or pack else None
   grams=quantity*(1000 if unit=='kg' else 1) if pack and not unit_price else None;kind='unit' if unit_price else 'pack' if pack else 'unknown';start,end=date_range(line)
   # Price applicability requires store naming in the same evidence block, not a corporate logo elsewhere.
   applicability='confirmed' if any(canonical(n) in canonical(line) for n in store['scopeNames']) else 'unknown'
   fields={'priceYen':'source','quantity':'source' if quantity else 'unknown','unit':'source' if unit else 'unknown','packGrams':'source' if grams else 'unknown','validFrom':'source' if start else 'unknown','validTo':'source' if end else 'unknown','comparisonPriceYen':'unknown','savingsYen':'unknown'}
   found.append({'id':'firecrawl:'+digest([store['id'],record['sourceUrl'],line_no,line])[:20],'storeId':store['id'],'ingredientId':i['id'],'productName':alias,'priceYen':price_value,'priceKind':kind,'quantity':quantity,'unit':unit,'packGrams':grams,'validFrom':start,'validTo':end,'comparisonPriceYen':None,'savingsYen':None,'tax':'included' if '税込' in line else 'excluded' if '税抜' in line else 'unknown','storeApplicability':applicability,'evidenceText':line[:1000],'fieldEvidence':fields,'observation':obs})
  obs['parseStatus']='parsed' if found else 'image_only' if not markdown and (data.get('images') or data.get('screenshot')) else 'no_products' if markdown else 'empty'
  if not found:obs['warnings'].append('No confirmed product prices extracted from text. Images are not OCR results.')
  output['deals'].extend(found);output['observations'].append(obs)
 for record in bundle['meals']:
  for raw in record['response'].get('meals') or []:
   if not isinstance(raw,dict):continue
   rid=text(raw.get('idMeal'));title=text(raw.get('strMeal'));obs=observation(bundle,record,'themealdb','parsed')
   if not re.fullmatch(r'\d+',rid) or not title:obs['parseStatus']='invalid';output['observations'].append(obs);continue
   rid='themealdb:'+rid
   if rid in seen_recipes:continue
   seen_recipes.add(rid);requirements=[];allergens=set();reasons=[]
   for line in range(1,21):
    name=text(raw.get('strIngredient'+str(line)));qty=text(raw.get('strMeasure'+str(line)))
    if not name:continue
    i=ingredient(name,aliases);ingredients[i['id']]=i;allergens.update(i['allergens']);requirements.append({'ingredientId':i['id'],'nameRaw':name,'measureRaw':qty,'raw':(name+' '+qty).strip(),'mapping':i['mapping'],'category':i['category'],**measure(qty)})
    if dislikes & {canonical(i['id']),canonical(i['nameEn']),canonical(i['nameJa']),canonical(i['category']),canonical(name)}:reasons.append('disliked_ingredient:'+i['id'])
   if not requirements:obs['parseStatus']='invalid';obs['warnings'].append('Recipe has no usable ingredient rows.');output['observations'].append(obs);continue
   reasons.extend('allergen:'+x for x in sorted(allergies & allergens))
   # TheMealDB V1 has no standard servings/time/macros/rating fields; never infer from text or title.
   output['recipes'].append({'id':rid,'title':title,'sourceUrl':safe_url(raw.get('strSource')),'image':safe_url(raw.get('strMealThumb')),'instructions':text(raw.get('strInstructions')),'servings':None,'cookingMinutes':None,'rating':None,'nutrition':{'kcal':None,'protein':None,'fat':None,'carbs':None},'requirements':requirements,'allergens':sorted(allergens),'eligibility':'excluded' if reasons else 'needs_review','exclusionReasons':reasons,'fieldEvidence':{'title':'source','image':'source' if safe_url(raw.get('strMealThumb')) else 'unknown','instructions':'source' if text(raw.get('strInstructions')) else 'unknown','servings':'unknown','cookingMinutes':'unknown','rating':'unknown','kcal':'unknown','protein':'unknown','fat':'unknown','carbs':'unknown'},'observation':obs});output['observations'].append(obs)
 output['ingredients']=list(ingredients.values());validate_output(output);return output

# Remote structural schema validator. No pip/network installation is required.
def obj(properties):return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
def arr(items):return {'type':'array','items':items}
def nullable(schema):return {'anyOf':[schema,{'type':'null'}]}
S={'type':'string'};N={'type':'number','minimum':0};NN=nullable(N);NS=nullable(S)
def enum(*values):return {'enum':list(values)}
B=enum('source','estimated','unknown');BMAP={'type':'object','additionalProperties':B}
OBS=obj(dict(runId=S,provider=enum('firecrawl','themealdb'),sourceUrl=S,fetchedAt=S,acquisitionMode=enum('live','saved'),acquiredBy=enum('firecrawl','themealdb','manual'),processedBy=enum('daytona'),contentHash={'type':'string','pattern':'^[a-f0-9]{64}$'},parseStatus=enum('parsed','no_products','image_only','blocked','failed','empty','invalid'),storeId=NS,screenshot=nullable(obj(dict(url=S,acquiredBy=enum('firecrawl'),sourceUrl=S,fetchedAt=S))),warnings=arr(S)))
REQ=obj(dict(ingredientId=S,nameRaw=S,measureRaw=S,raw=S,amount=NN,unit=NS,grams=NN,mapping=enum('exact','broad','unmapped'),category=NS,fieldEvidence=obj(dict(amount=B,unit=B,grams=B))))
RECIPE=obj(dict(id={'type':'string','pattern':'^themealdb:[0-9]+$'},title=S,sourceUrl=NS,image=NS,instructions=S,servings=NN,cookingMinutes=NN,rating=NN,nutrition=obj(dict(kcal=NN,protein=NN,fat=NN,carbs=NN)),requirements={**arr(REQ),'minItems':1},allergens=arr(S),eligibility=enum('needs_review','excluded'),exclusionReasons=arr(S),fieldEvidence=BMAP,observation=OBS))
DEAL=obj(dict(id=S,storeId=S,ingredientId=S,productName=S,priceYen=NN,priceKind=enum('pack','unit','unknown'),quantity=NN,unit=NS,packGrams=NN,validFrom=NS,validTo=NS,comparisonPriceYen=NN,savingsYen=NN,tax=enum('included','excluded','unknown'),storeApplicability=enum('confirmed','unknown'),evidenceText=S,fieldEvidence=BMAP,observation=OBS))
SCHEMA=obj(dict(runId=S,inputHash=S,processedBy=enum('daytona'),environment=obj(dict(python=S,platform=S,parserVersion=enum('1'))),stores=arr(obj(dict(id=S,name=S,sourceUrl=S,scopeNames=arr(S)))),deals=arr(DEAL),recipes=arr(RECIPE),ingredients=arr(obj(dict(id=S,nameJa=NS,nameEn=S,category=NS,mapping=enum('exact','broad','unmapped'),allergens=arr(S),allergenReview=enum('needs_review')))),observations=arr(OBS),warnings=arr(S)))
def validate(value,schema,path='$'):
 if 'anyOf' in schema:
  for choice in schema['anyOf']:
   try:validate(value,choice,path);return
   except ValueError:pass
  raise ValueError('schema_nullable:'+path)
 if 'enum' in schema and value not in schema['enum']:raise ValueError('schema_enum:'+path)
 typ=schema.get('type');types={'object':dict,'array':list,'string':str,'number':(int,float),'null':type(None)}
 if typ and (not isinstance(value,types[typ]) or typ=='number' and isinstance(value,bool)):raise ValueError('schema_type:'+path)
 if typ=='number' and (not math.isfinite(value) or value<schema.get('minimum',-math.inf)):raise ValueError('schema_number:'+path)
 if typ=='string' and 'pattern' in schema and not re.fullmatch(schema['pattern'],value):raise ValueError('schema_pattern:'+path)
 if typ=='array':
  if len(value)<schema.get('minItems',0):raise ValueError('schema_items:'+path)
  for n,x in enumerate(value):validate(x,schema['items'],path+'.'+str(n))
 if typ=='object':
  props=schema.get('properties',{});extra=schema.get('additionalProperties',True)
  if any(k not in value for k in schema.get('required',[])):raise ValueError('schema_required:'+path)
  for k,x in value.items():
   if k in props:validate(x,props[k],path+'.'+k)
   elif extra is False:raise ValueError('schema_extra:'+path)
   elif isinstance(extra,dict):validate(x,extra,path+'.'+k)
def validate_output(output):
 validate(output,SCHEMA);ids={i['id'] for i in output['ingredients']}
 for r in output['recipes']:
  for q in r['requirements']:
   if q['ingredientId'] not in ids:raise ValueError('ingredient_reference')
   for field,basis in q['fieldEvidence'].items():
    if (q[field] is None)!=(basis=='unknown'):raise ValueError('field_evidence')
 for d in output['deals']:
  if d['ingredientId'] not in ids:raise ValueError('ingredient_reference')
  if d['priceKind']!='pack' and d['packGrams'] is not None:raise ValueError('invalid_pack')
  for k in ['validFrom','validTo']:
   if d[k] is not None:date.fromisoformat(d[k])
 for o in output['observations']:
  if o['runId']!=output['runId']:raise ValueError('run_mismatch')
if __name__=='__main__':
 raw=open(sys.argv[1],'rb').read();bundle=json.loads(raw);aliases=json.load(open(sys.argv[2]));result=parse(bundle,hashlib.sha256(raw).hexdigest(),aliases);json.dump(result,open(sys.argv[3],'w'),ensure_ascii=False,allow_nan=False)
