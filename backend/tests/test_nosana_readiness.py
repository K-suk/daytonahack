import unittest,tempfile,sys,json,time
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import nosana_readiness as readiness
import nosana
from inference import select
class ReadinessTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'state.json';self.env=patch.dict('os.environ',{'NOSANA_INFERENCE_BASE_URL':'https://example.test','NOSANA_MODEL':'fixture-model','NOSANA_PROTOCOL':'ollama','NOSANA_INFERENCE_API_KEY':''});self.env.start();self.file=patch.object(readiness,'STATE',self.path);self.file.start()
 def tearDown(self):self.file.stop();self.env.stop();self.tmp.cleanup()
 def test_url_alone_not_ready(self):
  with patch('nosana.select') as inference:
   self.assertEqual(nosana.choose([{'recipeId':'a'}],{},1)['status'],'configured_unverified');inference.assert_not_called()
 def test_ready_expiry_and_configuration_change(self):
  readiness.record('ready');self.assertEqual(readiness.connection()['status'],'ready')
  with patch.dict('os.environ',{'NOSANA_MODEL':'different'}):self.assertEqual(readiness.connection()['status'],'configured_unverified')
  data=json.loads(self.path.read_text());data['checkedAt']=time.time()-301;self.path.write_text(json.dumps(data));self.assertEqual(readiness.connection()['status'],'configured_unverified')
 def test_failed_inference_invalidates_ready(self):
  readiness.record('ready')
  with patch('nosana.select',side_effect=TimeoutError):self.assertEqual(nosana.choose([{'recipeId':'a'}],{},1)['status'],'failed')
  self.assertNotEqual(readiness.connection()['status'],'ready')
 def test_management_key_never_sent_to_inference(self):
  with patch.dict('os.environ',{'NOSANA_INFERENCE_API_KEY':'nos_fixture_not_real'}),patch('inference.requests.post') as request:
   with self.assertRaises(ValueError):select([{'recipeId':'a'}],{},1)
   request.assert_not_called()
if __name__=='__main__':unittest.main()
