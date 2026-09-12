import unittest,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from normalize import normalize,A
from accounting import calculate_evidenced,Quantity
from nosana import choose
from unittest.mock import patch
class BackendTests(unittest.TestCase):
 def test_daytona_output_is_authoritative(self):
  receipt=json.loads((A/'daytona-saved-result.json').read_text());facts=json.loads((A/'daytona-saved-recipes.json').read_text())[:1]
  data=normalize(facts,receipt);self.assertEqual(len(data['recipes']),1);self.assertEqual(data['recipes'][0]['evidence']['environment'],'daytona');self.assertEqual(data['recipes'][0]['evidence']['route'],'saved')
 def test_remote_parser_code_compiles(self):
  import ast
  tree=ast.parse((A.parent/'daytona_saved.py').read_text())
  code=next(n.value.value for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='code' for t in n.targets))
  compile(code,'daytona_parser','exec')
 def test_hash_mismatch_rejected(self):
  receipt=json.loads((A/'daytona-saved-result.json').read_text());receipt['inputs'][0]['sha256']='bad'
  with self.assertRaises(ValueError):normalize([],receipt)
 def test_nosana_missing_does_not_call(self):
  with patch.dict('os.environ',{'NOSANA_INFERENCE_BASE_URL':''}),patch('nosana.select') as request:
   self.assertEqual(choose([],{},7)['status'],'unconnected');request.assert_not_called()
 def test_estimate_requires_reason(self):
  with self.assertRaises(ValueError):Quantity(value=12,basis='estimated',sourceUrl='https://example.test')
 def test_estimated_quantity_propagates(self):
  # Synthetic testing values only, never runtime recipe or price records.
  def q(v,b='source'):return dict(value=v,basis=b,sourceUrl='https://example.test/fixture',reason='test estimate' if b=='estimated' else None)
  result=calculate_evidenced([{'x':q(100,'estimated')}],{'x':{k:q(1) for k in ['kcal','protein','fat','carbs']}},{'x':dict(priceKind='pack',priceYen=q(200),packGrams=q(300),tax='included',conditionsVerified=True,validFrom='2026-09-12',validTo='2026-09-12')},[],'2026-09-12',1000)
  self.assertEqual(result['totalYen'],200);self.assertEqual(result['totalBasis'],'estimated');self.assertEqual(result['nutritionBasis']['protein'],'estimated')
if __name__=='__main__':unittest.main()
