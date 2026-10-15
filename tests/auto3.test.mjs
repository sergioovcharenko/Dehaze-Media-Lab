import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateFog,fogLabel} from '../src/auto3.js';

const makeImage=(kind)=>{
 const w=64,h=36,d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  const n=(x*23+y*19)%151;
  const color=kind==='fog'?[157+n*.04,162+n*.04,166+n*.04]:
    x%5<2?[15+n*.25,28+n*.20,90+n*.18]:[90+n*.43,122+n*.40,25+n*.12];
  for(let k=0;k<3;k++) d[i+k]=Math.min(255,Math.round(color[k]));
  d[i+3]=255;
 }
 return {width:w,height:h,data:d};
};

test('haze estimator returns a bounded numeric density for images',()=>{
 for(const kind of ['fog','clear']){
  const sample=estimateFog(makeImage(kind));
  assert.equal(sample.valid,true);
  assert.ok(Number.isFinite(sample.density));
  assert.ok(sample.density>=0&&sample.density<=1);
  assert.ok(sample.confidence>=0&&sample.confidence<=1);
 }
});

test('muted, low contrast frame has higher heuristic haze estimate',()=>{
 const hazy=estimateFog(makeImage('fog'));
 const clear=estimateFog(makeImage('clear'));
 assert.ok(hazy.density>clear.density, `hazy ${hazy.density} vs clear ${clear.density}`);
});

test('labels cover all four severity bands',()=>{
 assert.equal(fogLabel(0),'Туман не виявлено');
 assert.equal(fogLabel(.28),'Легкий серпанок');
 assert.equal(fogLabel(.49),'Середній серпанок');
 assert.equal(fogLabel(.87),'Густий серпанок');
});
