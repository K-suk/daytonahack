"""Node-callable Daytona + Aura adapter, reusing installed validation SDKs.
Never logs exception messages or credentials. No Nosana or Cookpad code.
"""
import hashlib,json,os,signal,sys,time
from pathlib import Path
class Cancelled(BaseException):pass
def stop(*_):raise Cancelled()
def write(path,data):Path(path).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False))
def daytona(input_path,output_path,deadline):
 from daytona import Daytona,CreateSandboxFromSnapshotParams
 client=Daytona();sandbox=None;name='dinner-data-'+json.loads(Path(input_path).read_text())['runId'];receipt={'status':'failed','processedBy':'daytona','cleanup':'not_created','inputHash':hashlib.sha256(Path(input_path).read_bytes()).hexdigest()};out=Path(output_path);root=Path(__file__).parent
 def remaining(cap=20):
  left=int(deadline-time.time())
  if left<1:raise Cancelled()
  return min(cap,left)
 try:
  signal.alarm(remaining(120));sandbox=client.create(CreateSandboxFromSnapshotParams(name=name,language='python',labels={'dinner-scout-data':name},auto_stop_interval=3,auto_delete_interval=5,ttl_minutes=5),timeout=remaining(30))
  sandbox.fs.upload_file(Path(input_path).read_bytes(),'/tmp/dinner-input.json',timeout=remaining())
  sandbox.fs.upload_file((root/'aliases.json').read_bytes(),'/tmp/dinner-aliases.json',timeout=remaining())
  sandbox.fs.upload_file((root/'parse_remote.py').read_bytes(),'/tmp/dinner-parse.py',timeout=remaining())
  result=sandbox.process.exec('python /tmp/dinner-parse.py /tmp/dinner-input.json /tmp/dinner-aliases.json /tmp/dinner-output.json',timeout=remaining(15))
  if result.exit_code!=0:raise ValueError('remote_parse_failed')
  sandbox.fs.download_file('/tmp/dinner-output.json',str(out));parsed=json.loads(out.read_text())
  if parsed['inputHash']!=receipt['inputHash'] or parsed['runId']!=json.loads(Path(input_path).read_text())['runId']:raise ValueError('receipt_mismatch')
  receipt.update(status='success',runId=parsed['runId'],outputHash=hashlib.sha256(out.read_bytes()).hexdigest(),environment=parsed['environment'],recipeCount=len(parsed['recipes']),dealCount=len(parsed['deals']))
 except Cancelled:receipt['code']='deadline_or_cancelled'
 except BaseException as e:receipt['code']='daytona_'+type(e).__name__
 finally:
  signal.alarm(0);signal.signal(signal.SIGTERM,signal.SIG_IGN)
  # Cleanup is independent of the cancelled work deadline, with a bounded grace period.
  signal.alarm(25)
  try:
   if sandbox is None:
    try:sandbox=client.get(name,request_timeout=5)
    except Exception:pass
   if sandbox is not None:client.delete(sandbox,timeout=20,wait=True);receipt['cleanup']='deleted'
  except BaseException:receipt.update(cleanup='failed',sandboxName=name)
  finally:signal.alarm(0);write(str(out)+'.receipt.json',receipt)
 return receipt

# Fixed parameterized queries adapted from validation/graph.py. A Run completion marker
# and all observation nodes are committed atomically; existing unrelated data is untouched.
STORE='UNWIND $rows AS s MERGE (n:Store {id:s.id}) SET n.name=s.name,n.sourceUrl=s.sourceUrl'
INGREDIENT='UNWIND $rows AS i MERGE (n:Ingredient {id:i.id}) SET n.nameEn=i.nameEn,n.nameJa=i.nameJa,n.category=i.category,n.mapping=i.mapping'
DEAL='''UNWIND $rows AS d MATCH (s:Store {id:d.storeId}),(i:Ingredient {id:d.ingredientId})
MERGE (n:Deal {id:$runId+':'+d.id}) SET n.runId=$runId,n.sourceId=d.id,n.priceYen=d.priceYen,n.packGrams=d.packGrams,n.priceKind=d.priceKind,n.validFrom=d.validFrom,n.validTo=d.validTo,n.storeApplicability=d.storeApplicability,n.payload=d.payload
MERGE (s)-[:OFFERS]->(n) MERGE (n)-[:FOR_INGREDIENT]->(i)'''
RECIPE='''UNWIND $rows AS r MERGE (n:Recipe {id:$runId+':'+r.id})
SET n.runId=$runId,n.sourceId=r.id,n.title=r.title,n.servings=r.servings,n.cookingMinutes=r.cookingMinutes,n.eligibility=r.eligibility,n.payload=r.payload
WITH n,r UNWIND r.requirements AS q MATCH (i:Ingredient {id:q.ingredientId})
MERGE (n)-[req:REQUIRES {line:q.line}]->(i) SET req.raw=q.raw,req.amount=q.amount,req.unit=q.unit,req.grams=q.grams,req.mapping=q.mapping'''
CANDIDATES='''MATCH (run:DinnerDataRun {id:$runId,status:'complete'})
MATCH (r:Recipe) WHERE r.runId=run.id AND r.eligibility<>'excluded' AND (r.cookingMinutes IS NULL OR r.cookingMinutes<=30)
MATCH (r)-[q:REQUIRES]->(i:Ingredient)
WITH r,collect(DISTINCT i.id) AS required,collect(DISTINCT CASE WHEN q.mapping='exact' THEN i.id END) AS exactRequired,collect(DISTINCT i.category) AS requiredCategories
UNWIND $storeIds AS sid MATCH (s:Store {id:sid})
OPTIONAL MATCH (s)-[:OFFERS]->(d:Deal)-[:FOR_INGREDIENT]->(di:Ingredient)
WHERE d.runId=$runId AND d.storeApplicability='confirmed' AND d.validFrom<=$shoppingDate AND d.validTo>=$shoppingDate
WITH r,required,exactRequired,requiredCategories,s,collect(DISTINCT CASE WHEN di.mapping='exact' THEN di.id END) AS offered,collect(DISTINCT di.category) AS offeredCategories
RETURN s.id AS storeId,r.sourceId AS recipeId,r.title AS title,r.cookingMinutes AS cookingMinutes,
[x IN exactRequired WHERE x IN offered] AS matching,
[x IN requiredCategories WHERE x IN offeredCategories] AS broadMatches,
[x IN required WHERE NOT x IN offered AND NOT x IN $pantry] AS missing,
CASE WHEN any(x IN exactRequired WHERE x IN offered) THEN 'deals' ELSE 'general' END AS basis,'needs_review' AS allergyStatus
ORDER BY size(matching) DESC,size(missing),recipeId,storeId'''
COMMON='''MATCH (run:DinnerDataRun {id:$runId,status:'complete'})
MATCH (a:Recipe)-[:REQUIRES]->(i:Ingredient)<-[:REQUIRES]-(b:Recipe)
WHERE a.runId=run.id AND b.runId=run.id AND a.sourceId<b.sourceId AND a.eligibility<>'excluded' AND b.eligibility<>'excluded' AND (a.cookingMinutes IS NULL OR a.cookingMinutes<=30) AND (b.cookingMinutes IS NULL OR b.cookingMinutes<=30)
RETURN a.sourceId AS recipeA,b.sourceId AS recipeB,collect(DISTINCT i.id) AS commonIngredients'''
def aura(input_path,output_path,deadline):
 from neo4j import GraphDatabase,unit_of_work
 payload=json.loads(Path(input_path).read_text());data=payload['data'];receipt=payload['receipt'];conditions=payload['conditions'];run_id=data['runId']
 if receipt.get('status')!='success' or receipt.get('inputHash')!=data['inputHash'] or data['processedBy']!='daytona':raise ValueError('daytona_receipt_required')
 original=Path(payload['daytonaOutputPath']).read_bytes()
 if hashlib.sha256(original).hexdigest()!=receipt.get('outputHash') or json.loads(original)!=data:raise ValueError('daytona_output_hash_mismatch')
 result={'status':'failed','candidates':[],'commonIngredients':[]}
 try:
  signal.alarm(max(1,int(deadline-time.time())))
  with GraphDatabase.driver(os.environ['NEO4J_URI'],auth=(os.environ['NEO4J_USERNAME'],os.environ['NEO4J_PASSWORD']),connection_timeout=5,connection_acquisition_timeout=8,max_transaction_retry_time=0) as driver:
   with driver.session(database=os.getenv('NEO4J_DATABASE') or 'neo4j') as session:
    def query(tx,cypher,**params):return [r.data() for r in tx.run(cypher,**params)]
    @unit_of_work(timeout=12)
    def save(tx):
     existing=query(tx,'MATCH (r:DinnerDataRun {id:$id}) RETURN r.status AS status,r.inputHash AS inputHash,r.outputHash AS outputHash',id=run_id)
     if existing:
      if existing[0]['status']=='complete' and existing[0]['inputHash']==data['inputHash'] and existing[0]['outputHash']==receipt['outputHash']:return
      raise ValueError('run_id_already_exists')
     query(tx,'CREATE (r:DinnerDataRun {id:$id,status:"writing",inputHash:$inputHash,outputHash:$outputHash,processedBy:"daytona",payload:$payload})',id=run_id,inputHash=data['inputHash'],outputHash=receipt['outputHash'],payload=json.dumps({'observations':data['observations'],'receipt':receipt}))
     query(tx,STORE,rows=data['stores']);query(tx,INGREDIENT,rows=data['ingredients'])
     query(tx,DEAL,runId=run_id,rows=[dict(d,payload=json.dumps(d)) for d in data['deals']])
     query(tx,RECIPE,runId=run_id,rows=[dict(r,payload=json.dumps(r),requirements=[dict(q,line=i) for i,q in enumerate(r['requirements'])]) for r in data['recipes']])
     query(tx,'MATCH (r:DinnerDataRun {id:$id}) SET r.status="complete"',id=run_id)
    session.execute_write(save)
    @unit_of_work(timeout=8)
    def read(tx):return {'status':'success','candidates':query(tx,CANDIDATES,runId=run_id,shoppingDate=conditions['shoppingDate'],pantry=conditions['pantry'],storeIds=[s['id'] for s in data['stores']]),'commonIngredients':query(tx,COMMON,runId=run_id)}
    result=session.execute_read(read)
 except Cancelled:result['code']='deadline_or_cancelled'
 except BaseException as e:result['code']='aura_'+type(e).__name__
 finally:signal.alarm(0);write(output_path,result)
 return result
if __name__=='__main__':
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGALRM,stop)
 try:
  mode,input_path,output_path,deadline=sys.argv[1:];result=(daytona if mode=='daytona' else aura)(input_path,output_path,float(deadline));print(json.dumps({'status':result['status'],'code':result.get('code'),'cleanup':result.get('cleanup')}))
 except BaseException as e:print(json.dumps({'status':'failed','code':'bridge_'+type(e).__name__}));sys.exit(1)
