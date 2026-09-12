"""Drop-in caller for the existing Python API's pipeline; does not edit it.
Imports no Nosana module. Progress is forwarded only from actual Node events.
"""
import json,os,subprocess,tempfile,time,uuid
from pathlib import Path

def collect_for_backend(conditions, run_id=None, emit=None, *, data_root=None, deadline=None):
 root=Path(data_root or Path(__file__).resolve().parents[2]);rid=run_id or str(uuid.uuid4());deadline=deadline or time.time()+180
 # The Node collector validates the run ID before any run-specific file writes.
 if not rid or len(rid)>80 or any(not(c.isascii() and (c.isalnum() or c=='-')) for c in rid):raise ValueError('invalid_run_id')
 values=conditions.model_dump() if hasattr(conditions,'model_dump') else conditions
 with tempfile.TemporaryDirectory(prefix='dinner-data-input-') as tmp:
  path=Path(tmp)/'conditions.json';path.write_text(json.dumps(values));path.chmod(0o600)
  cmd=['node',str(root/'node_modules/tsx/dist/cli.mjs'),str(root/'scripts/dinner-data/collect.ts'),'--conditions',str(path),'--run-id',rid,'--deadline',str(int(deadline*1000))]
  process=subprocess.Popen(cmd,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
  try:
   for line in process.stdout:
    try:event=json.loads(line)
    except ValueError:continue
    if isinstance(event,dict) and 'sequence' in event and emit:
     emit(event['stage'],{'success':'complete','started':'running','failed':'failed'}[event['status']],**{k:v for k,v in event.items() if k not in ['stage','status']})
   process.wait(timeout=max(1,deadline-time.time()+30))
  except BaseException:
   process.terminate()
   try:process.wait(timeout=30)
   except subprocess.TimeoutExpired:process.kill();process.wait()
   raise
 result_path=Path(os.environ.get('DINNER_DATA_RUNS_DIR',root/'.data-runs'))/rid/'result.json'
 if not result_path.is_absolute():result_path=root/result_path
 if not result_path.exists():raise RuntimeError('data_collection_failed_before_result')
 return json.loads(result_path.read_text())
