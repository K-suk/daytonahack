"""Extract facts from saved live responses; curated aliases keep state/cut distinctions."""
import json,re,hashlib
from pathlib import Path
from bs4 import BeautifulSoup
from schema import Recipe,Deal
ROOT=Path(__file__).parent;A=ROOT/'artifacts'
def read(n):return json.loads((A/n).read_text())
aliases={'ブロッコリー':('broccoli-raw','broccoli, raw florets'),'豚こま切れ肉':('pork-mixed-cut-raw','pork mixed cuts, raw'),'豚肉':('pork-unspecified-raw','pork, cut unspecified, raw'),'玉ねぎ':('onion-raw','onion, raw'),'バター':('butter','butter'),'醤油':('soy-sauce','soy sauce'),'酒':('sake','cooking sake'),'塩':('salt','salt'),'胡椒':('pepper','pepper')}
ingredients={};recipes=[]
for name in ['cookpad-one','recipe-25675338','recipe-25962767','recipe-25646265']:
 meta=read(name+'.metadata.json');s=BeautifulSoup((A/(name+'.html')).read_text(),'html.parser')
 facts=[]
 for tag in s.select('script[type="application/ld+json"]'):
  try:d=json.loads(tag.string or '{}')
  except ValueError:continue
  if d.get('@type')=='Recipe':facts.append(d)
 if not facts:continue
 d=facts[0];req=[]
 for raw in d.get('recipeIngredient',[]):
  nameja,_,qty=raw.partition(' ')
  iid,en=aliases.get(nameja,('unmapped-'+hashlib.sha256(nameja.encode()).hexdigest()[:12],None))
  ingredients[iid]={'id':iid,'nameJa':nameja,'nameEn':en}
  m=re.fullmatch(r'(\d+(?:\.\d+)?)(g|kg)',qty)
  grams=float(m[1])*(1000 if m[2]=='kg' else 1) if m else None
  req.append({'ingredientId':iid,'nameJa':nameja,'amount':float(m[1]) if m else None,'unit':m[2] if m else None,'raw':raw,'grams':grams,'conversionSource':meta['finalUrl'] if m else None})
 yieldraw=str(d.get('recipeYield',''));m=re.fullmatch(r'(?:たっぷり)?(\d+)人分',yieldraw)
 bm=next((x.get('userInteractionCount') for x in d.get('interactionStatistic',[]) if x.get('interactionType','').endswith('BookmarkAction')),None)
 r=Recipe(id=meta['finalUrl'].rstrip('/').split('/')[-1],title=d['name'],sourceUrl=meta['finalUrl'],evidence={'route':'saved','basis':'source','sourceUrl':meta['finalUrl'],'fetchedAt':meta['fetchedAt'],'environment':'local'},servings=int(m[1]) if m else None,servingsRaw=yieldraw,cookingMinutes=None,cooksnapCount=d.get('commentCount'),bookmarkCount=bm,requirements=req)
 recipes.append(r.model_dump())
meta=read('seijo-flyer.metadata.json')
evidence={'route':'saved','basis':'source','sourceUrl':meta['sourceUrl'],'fetchedAt':meta['fetchedAt'],'environment':'local'}
deals=[]
for iid,product,price,qty,unit,start,end in [('broccoli-raw','北海道産 大槻さんの海の神 ブロッコリー',312,1,'株','2026-09-12','2026-09-12'),('pork-mixed-cut-raw','国産 豚切落し',215,100,'g','2026-09-11','2026-09-13'),('chicken-thigh-skin-unspecified-raw','国産 鶏もも唐揚げ・水炊き用',215,100,'g','2026-09-11','2026-09-13')]:
 ingredients.setdefault(iid,{'id':iid,'nameJa':product,'nameEn':None})
 deals.append(Deal(id='seijo-'+iid+'-'+start,storeId='seijo-minamiaoyama',ingredientId=iid,productName=product,priceYen=price,tax='included',quantity=qty,unit=unit,validFrom=start,validTo=end,membershipRequired=False,purchaseConditions='Subject to stock and store availability. Meat pack weight not published.',evidence=evidence).model_dump())
stores=[{'id':'seijo-minamiaoyama','name':'成城石井 南青山店','address':'東京都港区南青山2-27-25 ヒューリック南青山ビル1F','sourceUrl':'https://shop.seijoishii.com/seijoishii/spot/detail?code=0150'}, {'id':'kino-aoyama','name':'紀ノ国屋 インターナショナル（青山店）','address':'東京都港区北青山3-11-7 AoビルB1F','sourceUrl':'https://www.e-kinokuniya.com/store/KINOKUNIYA/international'},{'id':'ville-aoyama','name':'ヴィルマルシェ 青山店','address':'東京都港区北青山2-13-5','sourceUrl':'https://page.line.me/kaq2977y'}]
(A/'sample-data.json').write_text(json.dumps({'stores':stores,'ingredients':list(ingredients.values()),'deals':deals,'recipes':recipes,'extractionMethod':'Recipe JSON-LD parser; flyer visually transcribed by validation assistant (not Nosana); no automatic OCR claim'},ensure_ascii=False,indent=2))
foods={}
for name,iid in [('rice','rice-cooked'),('broccoli','broccoli-raw')]:
 soup=BeautifulSoup((A/(name+'.html')).read_text(),'html.parser');values={}
 for row in soup.select('tr'):
  cells=row.find_all(['td','th'],recursive=False)
  if len(cells)>=3:
   label=cells[0].get_text('',strip=True)
   for ja,en in [('エネルギー','kcal'),('たんぱく質','protein'),('脂質','fat'),('炭水化物','carbs')]:
    if label==ja:
     try:values[en]=float(cells[1].get_text(strip=True))
     except ValueError:pass
 values.update(sourceUrl=read(name+'.metadata.json')['sourceUrl'],basis='source',perGrams=100,state='cooked' if name=='rice' else 'raw edible florets')
 foods[iid]=values
(A/'nutrition.json').write_text(json.dumps(foods,ensure_ascii=False,indent=2))
print('validated recipes',len(recipes),'deals',len(deals),'nutrition',foods)
