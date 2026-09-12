import unittest,json
from calculation import calculate
from schema import validate_selection
class Accounting(unittest.TestCase):
 def setUp(self):
  self.food={'x':dict(kcal=100,protein=10,fat=2,carbs=5),'rice':dict(kcal=156,protein=2.5,fat=.3,carbs=37.1)}
  # Synthetic offers are testing fixtures, never supermarket claims.
  self.offer={'x':dict(packGrams=300,priceYen=200,tax='included',validFrom='2026-09-12',validTo='2026-09-12',conditionsVerified=True,basis='estimated')}
 def calc(self,meals,pantry=()):return calculate(meals,self.food,self.offer,pantry,'2026-09-12',1000)
 def test_aggregate_then_round(self):
  r=self.calc([{'x':100} for _ in range(7)]);self.assertEqual(r['shopping'][0]['packs'],3);self.assertEqual(r['totalYen'],600)
 def test_replacement_recalculates_whole_week(self):
  a=[{'x':100} for _ in range(7)];a[0]={'x':400};self.assertEqual(self.calc(a)['totalYen'],800)
 def test_pantry_nutrition_remains(self):
  r=self.calc([{'rice':150}],['rice']);self.assertEqual(r['totalYen'],0);self.assertEqual(r['weeklyNutrition']['kcal'],234)
 def test_missing_quantity_is_not_zero(self):
  r=self.calc([{'x':None}]);self.assertIsNone(r['totalYen']);self.assertIsNone(r['weeklyNutrition']['protein'])
 def test_missing_nutrition_is_not_zero(self):
  self.food['x']['protein']=None;r=self.calc([{'x':100}]);self.assertIsNone(r['weeklyNutrition']['protein']);self.assertEqual(r['weeklyNutrition']['kcal'],100)
 def test_expired_deal_unusable(self):
  self.offer['x']['validTo']='2026-09-11';self.assertEqual(self.calc([{'x':100}])['budgetStatus'],'unknown')
 def test_no_comparison_no_savings(self):self.assertIsNone(self.calc([{'x':100}])['shopping'][0]['savedYen'])
 def test_unknown_pack_unusable(self):
  self.offer['x']['packGrams']=None;self.assertIsNone(self.calc([{'x':100}])['totalYen'])
 def test_negative_quantity_rejected(self):
  with self.assertRaises(ValueError):self.calc([{'x':-1}])
class ModelOutput(unittest.TestCase):
 def test_bad_json_rejected(self):
  with self.assertRaises(ValueError):validate_selection('not json',['a'],1)
 def test_unknown_id_rejected(self):
  with self.assertRaises(ValueError):validate_selection(json.dumps({'days':[{'day':1,'recipeId':'invented','servings':1,'reason':'test'}]}),['a'],1)
 def test_missing_days_rejected(self):
  with self.assertRaises(ValueError):validate_selection(json.dumps({'days':[{'day':1,'recipeId':'a','servings':1,'reason':'test'}]}),['a'],7)

class Conversions(unittest.TestCase):
 def test_source_backed_spoon(self):
  from conversion import seasoning_grams
  r=seasoning_grams('soy-sauce',.5,'大さじ');self.assertEqual(r['grams'],9);self.assertEqual(r['basis'],'estimated')
 def test_unknown_measure_stays_unknown(self):
  from conversion import seasoning_grams
  self.assertIsNone(seasoning_grams('soy-sauce',4,'フライパン周')['grams'])
  self.assertIsNone(seasoning_grams('broccoli-raw',1,'株')['grams'])

if __name__=='__main__':unittest.main()
