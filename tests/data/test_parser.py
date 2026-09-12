import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('remote',ROOT/'scripts/dinner-data/parse_remote.py');remote=importlib.util.module_from_spec(spec);spec.loader.exec_module(remote)
ALIASES=json.loads((ROOT/'scripts/dinner-data/aliases.json').read_text())
def bundle():return {'runId':'test-only','stores':[{'id':'store','name':'Store','sourceUrl':'https://example.com','scopeNames':['南青山店']}],'conditions':{'allergies':[],'dislikes':[]},'pages':[],'meals':[]}
def meal(**extra):return {'sourceUrl':'https://www.themealdb.com/api.php','fetchedAt':'2026-09-12T00:00:00Z','acquisitionMode':'live','response':{'meals':[{'idMeal':'123','strMeal':'Fixture only','strIngredient1':'Chicken Breast','strMeasure1':'200 g','strIngredient2':'Salt','strMeasure2':'to taste',**extra}]}}
class ParserTests(unittest.TestCase):
 def test_missing_stays_null_and_ids_are_namespaced(self):
  b=bundle();b['meals']=[meal(),meal()];out=remote.parse(b,'abc',ALIASES);r=out['recipes'][0];self.assertEqual(len(out['recipes']),1);self.assertEqual(r['id'],'themealdb:123');self.assertIsNone(r['servings']);self.assertIsNone(r['cookingMinutes']);self.assertIsNone(r['nutrition']['protein']);self.assertEqual(r['requirements'][0]['grams'],200);self.assertIsNone(r['requirements'][1]['grams']);self.assertEqual(r['eligibility'],'needs_review');self.assertEqual(r['observation']['acquisitionMode'],'live');self.assertEqual(r['observation']['processedBy'],'daytona')
 def test_cuts_and_broad_mapping_do_not_share_ids(self):
  breast=remote.ingredient('Chicken Breast',ALIASES);thigh=remote.ingredient('Chicken Thighs',ALIASES);broad=remote.ingredient('Chicken',ALIASES);unknown=remote.ingredient('Smoked chicken breast',ALIASES);self.assertNotEqual(breast['id'],thigh['id']);self.assertNotEqual(breast['id'],unknown['id']);self.assertEqual(broad['mapping'],'broad')
 def test_known_allergen_excluded_unknown_ingredient_needs_review(self):
  b=bundle();b['conditions']['allergies']=['soy'];b['meals']=[meal(strIngredient2='Soy sauce')];r=remote.parse(b,'abc',ALIASES)['recipes'][0];self.assertEqual(r['eligibility'],'excluded');b['meals']=[meal(strIngredient2='Mystery sauce')];self.assertEqual(remote.parse(b,'abc',ALIASES)['recipes'][0]['eligibility'],'needs_review')
 def test_unit_price_never_becomes_pack_and_dates_are_not_refreshed(self):
  b=bundle();b['pages']=[{'storeId':'store','sourceUrl':'https://example.com','fetchedAt':'2026-09-12T00:00:00Z','acquisitionMode':'saved','response':{'data':{'markdown':'南青山店 鶏むね肉 100g当たり 98円 2020/01/01 - 2020/01/02'}}}];out=remote.parse(b,'abc',ALIASES);d=out['deals'][0];self.assertEqual(d['priceKind'],'unit');self.assertIsNone(d['packGrams']);self.assertEqual(d['validTo'],'2020-01-02');self.assertEqual(d['observation']['acquisitionMode'],'saved');self.assertIsNone(d['savingsYen'])
 def test_empty_rows_and_bad_schema(self):
  b=bundle();b['meals']=[meal(strIngredient1='',strIngredient2='')];out=remote.parse(b,'abc',ALIASES);self.assertEqual(out['recipes'],[]);self.assertEqual(out['observations'][0]['parseStatus'],'invalid');out['recipes']='wrong';self.assertRaises(ValueError,remote.validate_output,out)
if __name__=='__main__':unittest.main()
