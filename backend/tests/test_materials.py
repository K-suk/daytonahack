import unittest,sys,json,copy,ast
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from materials import load_manifest,local_file,Document
from planning import swap,calculate_plan,deficiencies
from schema import Conditions
from accounting import Quantity
class MaterialsTests(unittest.TestCase):
 def test_traversal_rejected(self):
  doc=load_manifest().documents[0].model_copy(update={'localPath':'../.env'})
  with self.assertRaises(ValueError):local_file(doc)
 def test_hash_mismatch_rejected(self):
  doc=load_manifest().documents[0].model_copy(update={'contentHash':'0'*64})
  with self.assertRaises(ValueError):local_file(doc)
 def test_remote_parser_ignores_executable_scripts(self):
  tree=ast.parse((Path(__file__).resolve().parents[2]/'validation/daytona_saved.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='extract_documents')
  code=next(n.value.value for n in ast.walk(fn) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='code' for t in n.targets));scope={};exec(code.split('out=[]')[0],scope)
  p=scope['Parser']();p.feed('<script>raise Exception("must not run")</script><script type="application/ld+json">{"@type":"Recipe","name":"data"}</script>');self.assertEqual(p.recipes[0]['name'],'data')
 def test_local_document_evidence(self):
  self.assertEqual(Quantity(value=20,basis='estimated',sourceDocumentId='record',reason='human estimate').value,20)
 def test_unknown_and_unmet_distinct(self):
  r={'id':'test','cookingMinutes':40,'servings':None,'requirements':[],'allergens':[],'exclusionReviewed':False}
  issues=deficiencies({'recipes':[r]},Conditions())[0]['issues'];self.assertIn({'field':'cookingMinutes','status':'unmet','limit':30},issues);self.assertIn({'field':'servings','status':'unknown'},issues)
 def test_swap_recalculates_week_and_revision(self):
  # Synthetic fixtures confined to this test. No real recipe/price claims.
  def recipe(i,g):return dict(id=i,sourceUrl='https://example.test/fixture',servings=1,requirements=[dict(ingredientId='x',grams=g)])
  data=dict(recipes=[recipe('a',100),recipe('b',400)],stores=[{'id':'s'}],deals=[dict(id='d',storeId='s',ingredientId='x',priceYen=200,packGrams=300,quantity=300,unit='g',tax='included',validFrom='2026-09-12',validTo='2026-09-12',membershipRequired=False,evidence={'sourceUrl':'https://example.test/fixture'})],foods={'x':{k:dict(value=1,basis='source',sourceUrl='https://example.test/fixture') for k in ['kcal','protein','fat','carbs']}},conditions=Conditions().model_dump(),eligibility=[dict(recipeId=i,eligible=True) for i in ['a','b']],revision=0)
  selection={'days':[dict(day=i+1,recipeId='a',servings=1,reason='fixture') for i in range(7)]};data['mealPlan']=calculate_plan(data,selection,Conditions());self.assertEqual(data['mealPlan']['shopping']['totalYen'],600)
  result=swap(data,0,'b',0);self.assertEqual(result['mealPlan']['shopping']['totalYen'],800);self.assertEqual(result['revision'],1);self.assertEqual(data['revision'],0)
  with self.assertRaises(ValueError):swap(result,1,'a',0)
if __name__=='__main__':unittest.main()
