import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('src/styles.css','utf8');
const tabletJs=readFileSync('android/tablet.js','utf8');
const tabletCss=readFileSync('android/tablet.css','utf8');

test('camera stream is detached before the video source is replaced',()=>{
  const clear=app.match(/function clearPrevious\(\)\{([\s\S]*?)\n\}/);
  assert.ok(clear);
  assert.ok(clear[1].indexOf('stopCamera();')<clear[1].indexOf("sourceType='none'"));
  assert.ok(clear[1].includes('els.media.srcObject=null'));
  assert.ok(app.includes('els.media.srcObject=null;els.media.src=currentUrl'));
});

test('real-size video is hosted inside the viewer, never as an invisible 2px element',()=>{
  const start=html.indexOf('id="viewer"'),video=html.indexOf('id="mediaElement"'),canvas=html.indexOf('id="originalCanvas"');
  assert.ok(start>=0&&video>start&&canvas>video);
  assert.ok(css.includes('#mediaElement{position:absolute;inset:0;width:100%;height:100%;'));
  assert.ok(!css.includes('width:2px;height:2px;opacity:0'));
});

test('settings panel escapes layout stacking and scrim cannot intercept touches',()=>{
  assert.ok(tabletJs.includes('document.body.appendChild(settings)'));
  assert.ok(!tabletJs.includes("document.body.appendChild(scrim)"));
  assert.ok(tabletCss.includes('.tablet-scrim,body.panel-open .tablet-scrim{display:none!important;pointer-events:none!important}'));
  assert.ok(tabletCss.includes('body>.settings{position:fixed!important;z-index:2147483000!important'));
});
