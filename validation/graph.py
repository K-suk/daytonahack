"""Fixed parameterized Cypher, run-isolated observations. No LLM Cypher."""
import os,json
from neo4j import GraphDatabase,Query
CONSTRAINTS=[f'CREATE CONSTRAINT validation_{label.lower()} IF NOT EXISTS FOR (n:{label}) REQUIRE n.id IS UNIQUE' for label in ['Store','Deal','Ingredient','Recipe']]
INGEST='''
UNWIND $stores AS s MERGE (st:Store {id:s.id}) SET st.name=s.name, st.sourceUrl=s.sourceUrl
WITH count(*) AS ignored
UNWIND $ingredients AS i MERGE (n:Ingredient {id:i.id}) SET n.nameJa=i.nameJa,n.nameEn=i.nameEn
WITH count(*) AS ignored
UNWIND $deals AS d
MATCH (st:Store {id:d.storeId}), (i:Ingredient {id:d.ingredientId})
MERGE (o:Deal {id:$runId+':'+d.id}) SET o += d, o.id=$runId+':'+d.id,o.runId=$runId
MERGE (st)-[:OFFERS]->(o) MERGE (o)-[:FOR_INGREDIENT]->(i)
'''
RECIPES='''UNWIND $recipes AS r
MERGE (n:Recipe {id:$runId+':'+r.id}) SET n.sourceId=r.id,n.title=r.title,n.runId=$runId,n.sourceUrl=r.sourceUrl,n.servings=r.servings,n.cookingMinutes=r.cookingMinutes,n.cookingMinutesBasis=r.cookingMinutesBasis,n.route=r.evidence.route,n.basis=r.evidence.basis,n.fetchedAt=r.evidence.fetchedAt,n.processedIn=r.evidence.environment
WITH n,r UNWIND r.requirements AS q
MERGE (i:Ingredient {id:q.ingredientId})
MERGE (n)-[req:REQUIRES {line:q.line}]->(i)
SET req.amount=q.amount,req.unit=q.unit,req.grams=q.grams,req.raw=q.raw,req.gramsBasis=q.gramsBasis,req.gramsEvidence=q.gramsEvidence
'''
CANDIDATES='''MATCH (s:Store)-[:OFFERS]->(d:Deal)-[:FOR_INGREDIENT]->(i:Ingredient)
WHERE d.runId=$runId AND d.validFrom<=$shoppingDate AND d.validTo>=$shoppingDate
WITH s,collect(DISTINCT i.id) AS offered
MATCH (r:Recipe)-[q:REQUIRES]->(i:Ingredient) WHERE r.runId=$runId
WITH s,offered,r,collect(DISTINCT i.id) AS required,
collect({ingredientId:i.id,amount:q.amount,unit:q.unit,grams:q.grams,raw:q.raw}) AS requirements
WHERE any(x IN required WHERE x IN offered)
RETURN s.id AS storeId,r.sourceId AS recipeId,r.title AS title,r.servings AS servings,r.cookingMinutes AS cookingMinutes,
[x IN required WHERE x IN offered] AS matching,
[x IN required WHERE NOT x IN offered AND NOT x IN $pantry] AS missing,requirements
ORDER BY size(missing),recipeId'''
COMMON='''MATCH (a:Recipe)-[:REQUIRES]->(i:Ingredient)<-[:REQUIRES]-(b:Recipe)
WHERE a.runId=$runId AND b.runId=$runId AND a.sourceId<b.sourceId
RETURN a.sourceId AS recipeA,b.sourceId AS recipeB,collect(DISTINCT i.id) AS commonIngredients'''
COUNTS='''MATCH (n) WHERE n.runId=$runId RETURN labels(n)[0] AS kind,count(n) AS count'''
def driver():
 return GraphDatabase.driver(os.environ['NEO4J_URI'],auth=(os.environ['NEO4J_USERNAME'],os.environ['NEO4J_PASSWORD']),connection_timeout=10,connection_acquisition_timeout=20,max_transaction_retry_time=0)
def ingest_and_query(data,run_id,shopping_date,pantry):
 with driver() as d:
  d.verify_connectivity()
  with d.session(database=os.getenv('NEO4J_DATABASE') or 'neo4j') as s:
   def query(q,**p):return [r.data() for r in s.run(Query(q,timeout=8),**p)]
   for q in CONSTRAINTS:query(q)
   ingredients=data['ingredients'];deals=[{k:v for k,v in x.items() if k!='evidence'} for x in data['deals']]
   for x,y in zip(deals,data['deals']):x.update(sourceUrl=y['evidence']['sourceUrl'],fetchedAt=y['evidence']['fetchedAt'],route=y['evidence']['route'],basis=y['evidence']['basis'])
   recipes=[]
   for r in data['recipes']:
    x=dict(r);x['requirements']=[]
    x['cookingMinutesBasis']=data.get('measurements',{}).get(f"recipe/{r['id']}/cookingMinutes",{}).get('basis','unknown' if r['cookingMinutes'] is None else 'source')
    for i,q in enumerate(r['requirements']):
     ev=data.get('measurements',{}).get(f"recipe/{r['id']}/grams:{q['ingredientId']}",{'basis':'unknown' if q['grams'] is None else 'source','sourceUrl':q.get('conversionSource')})
     x['requirements'].append(dict(q,line=i,gramsBasis=ev['basis'],gramsEvidence=json.dumps(ev)))
    recipes.append(x)
   counts=[]
   for _ in range(2):
    query(INGEST,stores=data['stores'],ingredients=ingredients,deals=deals,runId=run_id)
    query(RECIPES,recipes=recipes,runId=run_id)
    counts.append(query(COUNTS,runId=run_id))
   return {'countsAfterEachIngest':counts,'idempotent':counts[0]==counts[1],'candidates':query(CANDIDATES,runId=run_id,shoppingDate=shopping_date,pantry=pantry),'commonIngredients':query(COMMON,runId=run_id)}
