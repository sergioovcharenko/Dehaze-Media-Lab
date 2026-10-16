"""Local Wi-Fi comparison server. Run from offline_dehaze/."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess, sys, json, base64, re
ROOT=Path(__file__).resolve().parent
HTML=(ROOT/'tablet.html').read_bytes()
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path not in ('/','/tablet.html'):
   self.send_error(404); return
  self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.end_headers(); self.wfile.write(HTML)
 def do_POST(self):
  if self.path!='/process': self.send_error(404); return
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<=0 or length>15_000_000: raise ValueError('Image must be under 15 MB')
   data=self.rfile.read(length)
   from PIL import Image
   import io
   im=Image.open(io.BytesIO(data)).convert('RGB')
   if im.width*im.height>12_000_000: raise ValueError('Image exceeds 12 megapixels')
   with TemporaryDirectory() as td:
    tmp=Path(td); inp=tmp/'input.png'; im.save(inp)
    cmd=[sys.executable,str(ROOT/'run.py'),'--image',str(inp),'--weights-dir',str(ROOT/'models'),'--output-dir',str(tmp/'out'),'--max-side','768']
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=600)
    out={}
    for name in ['original','dehazeformer-t','dehazeformer-s','dehazeformer-b','dehazeformer-m']:
     path=tmp/'out'/(name+'.png')
     if path.exists(): out[name]='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
    response={'images':out,'log':(p.stdout+'\n'+p.stderr)[-2500:],'ok':p.returncode==0}
   body=json.dumps(response).encode()
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  except Exception as exc:
   body=json.dumps({'ok':False,'error':str(exc)}).encode()
   self.send_response(400);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
if __name__=='__main__':
 print('Open http://YOUR-PC-IP:8765 on tablet (same Wi-Fi).')
 ThreadingHTTPServer(('0.0.0.0',8765),Handler).serve_forever()
