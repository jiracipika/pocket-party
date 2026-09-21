import subprocess,os,sys,json,datetime,time,signal
from pathlib import Path
root=Path(__file__).resolve().parent.parent
slug=sys.argv[1]
end=datetime.datetime.fromisoformat(json.loads((root/'docs/deadline.json').read_text())['stop_at']).timestamp()
remaining=min(1100,int(end-time.time()))
if remaining<60:raise SystemExit('Cutoff reached; no worker launched')
env=os.environ.copy();env['GLM_BASE_URL']='https://api.z.ai/api/coding/paas/v4'
cmd=['hermes','chat','--provider','zai','--model','glm-5.3-flash','--ignore-rules','--toolsets','terminal,file','--oneshot','--max-turns','70','--run-budget',str(remaining-20),'--query-file',str(root/'docs'/('repair-'+slug+'.md'))]
log=root/'docs'/('repair-'+slug+'.log')
with log.open('w') as f:
 p=subprocess.Popen(cmd,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
 print('Started repair',slug,'PID',p.pid,flush=True)
 try:rc=p.wait(timeout=remaining)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL)
  rc=124
print('Finished repair',slug,'exit',rc,flush=True)
sys.exit(rc)
