import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateFog, fogLabel} from '../src/auto3.js';

const w=96,h=54;
function scene(type){
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    const raw=[(x*13+y*5)%173+12,(x*3+y*19)%178+28,(x*7+y*11)%189+10];
    const alpha=type==='light'?.25:type==='medium'?.5:type==='dense'?.75:0;
    const base=type==='black'?[1,1,1]:type==='gray'?[139,139,139]:type==='white'?[255,255,255]:raw;
    for(let k=0;k<3;k++) data[i+k]=Math.round(base[k]*(1-alpha)+214*alpha);
    data[i+3]=255;
  }
  return {width:w,height:h,data};
}
test('Clear landscape and incremental veiling have ordered relative fog estimates',()=>{
  const samples=['clear','light','medium','dense'].map(k=>estimateFog(scene(k)));
  assert.ok(samples.every(s=>s.valid));
  assert.ok(samples.every(s=>s.density>=0&&s.density<=1));
  assert.ok(samples.every(s=>s.confidence>=0&&s.confidence<=1));
  for(let i=1;i<samples.length;i++) assert.ok(samples[i].density>samples[i-1].density);
});
test('Near black, white and flat inputs are explicitly unknown, not false haze readings',()=>{
  for(const kind of ['black','white','gray']){
    const s=estimateFog(scene(kind));
    assert.equal(s.valid,false,kind);
    assert.ok(typeof s.reason==='string'&&s.reason.length>2);
  }
});
test('Insufficient decoded frame is rejected',()=>{
  assert.equal(estimateFog({width:2,height:2,data:new Uint8ClampedArray(16)}).valid,false);
});
test('Severity labels are stable and meaningful',()=>{
  assert.equal(fogLabel(0),'Туман не виявлено');
  assert.equal(fogLabel(.28),'Легкий серпанок');
  assert.equal(fogLabel(.49),'Середній серпанок');
  assert.equal(fogLabel(.87),'Густий серпанок');
});
