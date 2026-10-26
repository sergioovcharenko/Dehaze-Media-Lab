import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shader=readFileSync(new URL('../src/shaders/dehaze-webgl.frag',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../src/gl.js',import.meta.url),'utf8');
const script=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('M16 and M17 use different GLSL branches',()=>{
  const a=shader.indexOf('mode<16.5');
  const b=shader.indexOf('mode<17.5');
  assert.ok(a>0 && b>a, 'independent branches required');
  assert.match(shader.slice(a,b),/16 AUTO 2\.0/);
  assert.match(shader.slice(b),/17 AUTO 3\.0/);
  assert.match(shader.slice(b),/wMedium=smoothstep/);
  assert.match(shader.slice(b),/wDense=smoothstep/);
  assert.match(shader.slice(b),/denoised/);
});

test('M17 receives fog strength and confidence from source-based analysis',()=>{
  assert.match(bridge,/u_fogDensity/);
  assert.match(bridge,/u_fogConfidence/);
  assert.match(bridge,/u_texel/);
  assert.match(bridge,/settings\.processing==='auto1'\|\|settings\.processing==='auto2'/);
  assert.match(bridge,/renderMode=isAuto3 && !hasEstimate \? 16 : mode/);
  assert.match(script,/settings\.processing==='auto3'\?17/);
});
