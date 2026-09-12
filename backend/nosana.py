"""Endpoint readiness and inference are separate from management provisioning."""
import os,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'validation'))
from inference import select

from nosana_readiness import connection,record

def choose(candidates,conditions,days):
 state=connection()
 if state['status']!='ready':return state
 if not candidates:return {'status':'blocked','reason':'no_fully_verified_30min_candidates'}
 try:
  result=select(candidates,conditions,days,time.monotonic()+25);record('ready');return {'status':'success',**result}
 except Exception as e:
  record('configured_unverified','nosana_inference_failed')
  return {'status':'failed','reason':'nosana_inference_failed','errorType':type(e).__name__}
