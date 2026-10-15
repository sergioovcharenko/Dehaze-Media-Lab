import {DehazeGL} from './gl.js';
import {estimateFog,fogLabel} from './auto3.js';

const $=id=>document.getElementById(id);
const MODES=[
  [1,'ADAPTIVE'],[2,'FAST DCP'],[3,'LIVE DCP'],[4,'CLASSICAL'],
  [5,'DCP BALANCED'],[6,'DCP STRONG'],[7,'CAP'],[8,'CLAHE-LIKE'],
  [9,'RETINEX-LIKE'],[10,'EDGE DCP'],[11,'MS RETINEX (LITE)'],
  [12,'LIME LIGHT'],[13,'LOCAL GAMMA'],[14,'CLASSIC + DCP'],[15,'LOCAL CONTRAST']
];
const DEFAULT={processing:'auto2',algorithm:4,scene:'auto',strength:65,preset:'medium',haze:65,contrast:10,brightness:0,saturation:100,sky:70,detail:15,view:'split',split:50,output:'native'};
const PRESETS={
  light:{haze:35,contrast:5,brightness:0,saturation:100,sky:75,detail:10},
  medium:{haze:65,contrast:10,brightness:0,saturation:100,sky:70,detail:15},
  dense:{haze:85,contrast:15,brightness:5,saturation:105,sky:85,detail:10},
  dusk:{haze:30,contrast:8,brightness:8,saturation:95,sky:80,detail:5}
};
let settings={...DEFAULT};
try{ const old=JSON.parse(localStorage.getItem('dehaze-web-v1')||'null');if(old){for(const key of Object.keys(DEFAULT)){if(old[key]!==undefined&&typeof old[key]===typeof DEFAULT[key])settings[key]=old[key];}} }catch{}
const els={original:$('originalCanvas'),processed:$('processedCanvas'),viewer:$('viewer'),media:$('mediaElement')};
const originalCtx=els.original.getContext('2d',{alpha:false,willReadFrequently:false});
const analysisCtx=$('analysisCanvas').getContext('2d',{willReadFrequently:true});
let gpu=null, source=null,sourceType='none',currentUrl=null,stream=null,frameDirty=true;
let isDragging=false, lastAnalysis=0,measuredNight=false,lastSample=null,lastMetrics=0, frames=0,msTotal=0;
let deviceFacing='environment',lastSize='';
const fog3={density:0,confidence:0,valid:false,label:'Очікування кадру',last:0};
function resetFog3(){fog3.density=0;fog3.confidence=0;fog3.valid=false;fog3.label='Очікування кадру';fog3.last=0;updateFogIndicator();}
function updateFogIndicator(){
  const fogLabelText=fog3.valid?fog3.label:'Немає достовірної оцінки';
  $('fogState').textContent=fogLabelText;
  $('fogPercent').textContent=fog3.valid?Math.round(fog3.density*100)+'%':'—';
  $('fogMeter').style.width=(fog3.valid?Math.round(fog3.density*100):0)+'%';
  $('fogConfidence').textContent=fog3.valid
    ?(fog3.confidence<.33?'Низька надійність':fog3.confidence<.65?'Середня надійність':'Вища надійність')
    :'Очікування фото, відео або камери';
  if(settings.processing==='auto3')$('previewMode').textContent='AUTO 3.0 · '+(fog3.valid?fog3.label:'аналіз…');
}

function setStatus(msg,type=''){$('message').textContent=msg;$('message').className='message '+type;}
function persist(){try{localStorage.setItem('dehaze-web-v1',JSON.stringify(settings));$('profileState').textContent='Налаштування збережено локально';}catch{$('profileState').textContent='Не вдалося зберегти профіль';}}
const sign=x=>x>0?'+'+x:String(x);
function updateAll() {
  for(const [k,val] of Object.entries(settings)){const node=$(k);if(node&&['INPUT','SELECT'].includes(node.tagName))node.value=String(val);}
  $('strength').value=settings.strength;$('strengthOut').textContent=settings.strength+'%';
  $('scenePreset').value=settings.preset;
  $('resSelect').value=settings.output;
  $('splitRange').value=settings.split;$('splitValue').textContent=settings.split+' / '+(100-settings.split);
  ['haze','contrast','brightness','saturation','sky','detail'].forEach(k=>{
    $(k).value=settings[k]; const v=document.querySelector(`[data-for="${k}"]`);
    v.textContent=['haze','saturation','sky','detail'].includes(k)?settings[k]+'%':sign(settings[k]);
  });
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===settings.processing));
  document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('active',b.dataset.scene===settings.scene));
  document.querySelectorAll('[data-strength]').forEach(b=>b.classList.toggle('active',Number(b.dataset.strength)===settings.strength));
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===settings.view));
  $('algorithm').disabled=settings.processing!=='manual';
  $('algorithm').value=settings.algorithm;
  let desc='';
  switch(settings.processing){
    case 'off':desc='OFF: без обробки, кадр залишається оригінальним.';break;
    case 'auto1':desc='AUTO 1.0 → M14 · CLASSICAL + DCP';break;
    case 'auto2':desc='AUTO 2.0 → M16 · захищений CLASSICAL + EDGE DCP';break;
    case 'auto3':desc='AUTO 3.0 → DCP + локальний контраст + насиченість; адаптивна сила M16';break;
    default:desc=`MANUAL → M${settings.algorithm} · ${MODES.find(x=>x[0]===settings.algorithm)?.[1]}`;
  }
  $('modeDetail').textContent=desc;
  $('previewMode').textContent=settings.processing==='off'?'OFF':settings.processing==='auto1'?'AUTO 1.0 · M14':settings.processing==='auto2'?'AUTO 2.0 · M16':settings.processing==='auto3'?'AUTO 3.0 · '+(fog3.valid?fog3.label:'аналіз…'):`MANUAL · M${settings.algorithm}`;
  const viewer=els.viewer;
  viewer.className='viewer view-'+settings.view;
  viewer.querySelector('.processed').style.clipPath=settings.view==='split'?`inset(0 0 0 ${settings.split}%)`:'';
  $('divider').style.left=settings.split+'%';
  $('splitBar').style.display=settings.view==='split'?'flex':'none';
  frameDirty=true;
}
function applyChange(key,value){settings[key]=value;if(['haze','contrast','brightness','saturation','sky','detail'].includes(key)) settings.preset='custom';persist();updateAll();}
function setSource(type,element,name){source=element;sourceType=type;frameDirty=true;resetFog3();$('emptyState').hidden=true;
  $('sourceTag').textContent=name;
  for(const id of ['saveFrame','saveOriginal']) $(id).disabled=false;
  const playing=type==='video';for(const id of ['playBtn','pauseBtn','stopBtn','minus10','plus10','timeline']) $(id).disabled=!playing;
  document.querySelectorAll('.playback-controls').forEach(p=>p.style.opacity=playing?'1':'.5');
  lastSize=''; updatePlayback();
}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}if(sourceType==='camera'){els.media.pause();els.media.srcObject=null;}}
function clearPrevious(){source=null;sourceType='none';stopCamera();els.media.pause();els.media.removeAttribute('src');els.media.load();if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null;}}
function openFile(file,kind){if(!file)return;
  const valid=kind==='image'?(file.type.startsWith('image/')||/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)):(file.type.startsWith('video/')||/\.(mp4|mov|m4v|webm)$/i.test(file.name));
  if(!valid){setStatus('Цей тип файлу не розпізнано. Обери звичайне фото або відео.','error');return;}
  clearPrevious();currentUrl=URL.createObjectURL(file);
  if(kind==='image'){
    const img=new Image(); img.onload=()=>{setSource('image',img,file.name);setStatus('Фото відкрито. Можна змінювати алгоритми та зберігати результат.','ok');};
    img.onerror=()=>setStatus('Фото не підтримується цим браузером. Спробуй JPEG, PNG або WebP.','error');img.src=currentUrl;
  }else{
    els.media.muted=true;els.media.playsInline=true;els.media.src=currentUrl;els.media.loop=false;
    els.media.onloadedmetadata=()=>{setSource('video',els.media,file.name);updatePlayback();};
    els.media.onerror=()=>setStatus('Не вдалося відкрити відео: браузер не підтримує його кодек. Спробуй MP4 H.264.','error');
    els.media.play().then(()=>{setStatus('Відео відтворюється. Натисни паузу для покадрового порівняння.','ok')}).catch(()=>setStatus('Відео завантажено. Натисни ▶ для відтворення.'));
  }
}
const dims=()=>{
  if(sourceType==='image')return [source.naturalWidth,source.naturalHeight];
  if(sourceType==='video'||sourceType==='camera')return [source.videoWidth,source.videoHeight];return [0,0];
};
async function cameraList(){if(!navigator.mediaDevices?.enumerateDevices)return;
  try{const all=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='videoinput');
    const s=$('cameraSelect'),wanted=s.value;s.innerHTML='<option value="">Автоматично · основна</option>';
    for(const [idx,d] of all.entries()) {const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`Камера ${idx+1}`;s.appendChild(o)}
    if([...s.options].some(o=>o.value===wanted))s.value=wanted;
  }catch{}
}
async function openCamera(id=''){
  if(!navigator.mediaDevices?.getUserMedia){setStatus('Камера недоступна. Відкрий сайт через HTTPS або localhost і дозволь доступ.','error');return;}
  clearPrevious();
  const sources=[
    {video:{...(id?{deviceId:{exact:id}}:{facingMode:{ideal:deviceFacing}}),width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:30,max:30}},audio:false},
    {video:{...(id?{deviceId:{ideal:id}}:{facingMode:{ideal:deviceFacing}}),width:{ideal:1920},height:{ideal:1080}},audio:false},
    {video:true,audio:false}
  ];
  let err;
  for(const c of sources){try{stream=await navigator.mediaDevices.getUserMedia(c);break;}catch(e){err=e;}}
  if(!stream){setStatus('Камеру не відкрито: '+(err?.message||'невідома помилка')+'. Перевір дозвіл браузера.','error');return;}
  els.media.srcObject=stream;els.media.muted=true;els.media.playsInline=true;els.media.autoplay=true;
  try{await els.media.play()}catch(e){setStatus('Натисни кнопку Камера ще раз для дозволу відтворення.','error');}
  setSource('camera',els.media,'Камера · LIVE');await cameraList();
  const track=stream.getVideoTracks()[0],trackSet=track?.getSettings?.()||{};
  setStatus(`Камера активна: ${trackSet.width||els.media.videoWidth} × ${trackSet.height||els.media.videoHeight}, ${trackSet.frameRate||'?'} кадрів/с. Максимум залежить від пристрою та браузера.`,'ok');
}
function outputSize(){const [w,h]=dims();if(!w||!h)return null;
  const max= Math.min(gpu?.maxTextureSize||4096, gpu?.gl?.getParameter(gpu.gl.MAX_RENDERBUFFER_SIZE)||4096);
  let width=w,height=h;const lim=settings.output==='native'?Infinity:Number(settings.output);
  // Width limits resolution; tall portraits are limited by GPU max texture size.
  const k=Math.min(1,lim/w,max/Math.max(w,h));
  width=Math.max(1,Math.round(width*k));height=Math.max(1,Math.round(height*k));
  return [width,height,w,h];
}
function analyzeFog3(time){
  if(settings.processing!=='auto3'||time-fog3.last<850)return;
  fog3.last=time;
  try{
    analysisCtx.drawImage(els.original,0,0,64,36);
    const sample=estimateFog(analysisCtx.getImageData(0,0,64,36));
    if(sample.valid){
      const first=!fog3.valid, alpha=sourceType==='image'||first?1:.22;
      fog3.density=first?sample.density:fog3.density*(1-alpha)+sample.density*alpha;
      fog3.confidence=sample.confidence;
      fog3.valid=true;fog3.label=fogLabel(fog3.density);
    }else{fog3.valid=false;fog3.label='Невизначено';}
  }catch(e){fog3.valid=false;fog3.label='Помилка аналізу';}
  updateFogIndicator();
}
function analyzeLighting(time){if(settings.scene!=='auto'){measuredNight=settings.scene==='night';$('lightState').textContent=measuredNight?'NIGHT':'DAY';return;}
  if(time-lastAnalysis<650)return;lastAnalysis=time;
  try{analysisCtx.drawImage(els.original,0,0,64,36);const d=analysisCtx.getImageData(0,0,64,36).data;
    let sum=0;for(let i=0;i<d.length;i+=16)sum+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
    const mean=(sum/(d.length/16))/255; lastSample=mean;
    if(mean<0.29) measuredNight=true; else if(mean>0.39) measuredNight=false;
    $('lightState').textContent=`AUTO → ${measuredNight?'NIGHT':'DAY'} (${Math.round(mean*100)}%)`;
  }catch{$('lightState').textContent='AUTO';}
}
function currentMode(){return settings.processing==='auto1'?14:settings.processing==='auto2'||settings.processing==='auto3'?16:settings.processing==='manual'?settings.algorithm:0;}
function draw(time){if(!gpu?.program||sourceType==='none')return;
  if ((sourceType==='video'||sourceType==='camera') && source.readyState<2) return;
  const z=outputSize();if(!z)return;
  const [w,h,sw,sh]=z;
  if(w!==els.original.width||h!==els.original.height){els.original.width=w;els.original.height=h;frameDirty=true;}
  const start=performance.now();
  originalCtx.drawImage(source,0,0,w,h);
  analyzeLighting(time);
  analyzeFog3(time);
  gpu.draw(els.original,settings,currentMode(),measuredNight,fog3);
  frames++;msTotal+=performance.now()-start;
  $('resolutionBadge').textContent=w+' × '+h;
  $('sourceResolution').textContent=sw+' × '+sh;
  lastSize=w+'x'+h;
  frameDirty=false;
}
function tick(time){requestAnimationFrame(tick);
  const motion=(sourceType==='video'&&!els.media.paused&&!els.media.ended)||(sourceType==='camera');
  if((motion||frameDirty)&&source){try{draw(time)}catch(e){setStatus('Помилка обробки відео: '+e.message,'error');source=null;}}
  if(sourceType==='video'&&time-lastMetrics>=250)updatePlayback();
  if(time-lastMetrics>=1000){$('fps').textContent=frames?String(frames):'—';$('frameMs').textContent=frames?(msTotal/frames).toFixed(1)+' ms':'—';frames=0;msTotal=0;lastMetrics=time;}
}
function formatTime(sec){if(!Number.isFinite(sec))return'00:00';const h=Math.floor(sec/3600),m=Math.floor(sec/60)%60,s=Math.floor(sec%60);return(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function updatePlayback(){const v=els.media;const isVideo=sourceType==='video';$('curTime').textContent=isVideo?formatTime(v.currentTime):'00:00';$('duration').textContent=isVideo?formatTime(v.duration):'00:00';
 if(isVideo&&!isDragging&&v.duration>0) $('timeline').value=Math.round((v.currentTime/v.duration)*1000);
}
function saveCanvas(canvas,name){if(!canvas.width){setStatus('Спочатку відкрий джерело.','error');return;}
  canvas.toBlob(blob=>{if(!blob){setStatus('Не вдалося зберегти PNG.','error');return;}
    const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`${name}_${new Date().toISOString().replace(/[:.]/g,'-')}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);
  },'image/png');
}
function wire(){
  for(const [n,label] of MODES){const o=document.createElement('option');o.value=n;o.textContent=`M${String(n).padStart(2,'0')} · ${label}`;$('algorithm').appendChild(o)}
  $('openPhoto').addEventListener('click',()=>$('photoInput').click());
  $('openVideo').addEventListener('click',()=>$('videoInput').click());
  $('openCamera').addEventListener('click',()=>openCamera($('cameraSelect').value));
  $('photoInput').addEventListener('change',e=>{openFile(e.target.files[0],'image');e.target.value=''});
  $('videoInput').addEventListener('change',e=>{openFile(e.target.files[0],'video');e.target.value=''});
  $('swapCamera').addEventListener('click',()=>{deviceFacing=deviceFacing==='environment'?'user':'environment';$('cameraSelect').value='';openCamera('')});
  $('cameraSelect').addEventListener('change',()=>{if(sourceType==='camera')openCamera($('cameraSelect').value)});
  $('resSelect').addEventListener('change',e=>applyChange('output',e.target.value));
  $('playBtn').addEventListener('click',()=>els.media.play().catch(e=>setStatus('Не вдалося відтворити відео: '+e.message,'error')));
  $('pauseBtn').addEventListener('click',()=>{els.media.pause();frameDirty=true});
  $('stopBtn').addEventListener('click',()=>{els.media.pause();els.media.currentTime=0;frameDirty=true;updatePlayback()});
  $('minus10').addEventListener('click',()=>{els.media.currentTime=Math.max(0,els.media.currentTime-10)});
  $('plus10').addEventListener('click',()=>{els.media.currentTime=Math.min(els.media.duration||0,els.media.currentTime+10)});
  $('speed').addEventListener('change',e=>els.media.playbackRate=Number(e.target.value));
  $('timeline').addEventListener('pointerdown',()=>isDragging=true);
  $('timeline').addEventListener('input',e=>{isDragging=true;if(els.media.duration>0)$('curTime').textContent=formatTime(els.media.duration*Number(e.target.value)/1000)});
  $('timeline').addEventListener('change',e=>{if(els.media.duration>0)els.media.currentTime=els.media.duration*Number(e.target.value)/1000;isDragging=false;frameDirty=true});
  window.addEventListener('pointerup',()=>{isDragging=false});
  els.media.addEventListener('seeked',()=>{frameDirty=true;updatePlayback()});
  els.media.addEventListener('pause',()=>{frameDirty=true});
  els.media.addEventListener('ended',()=>{frameDirty=true});
  $('splitRange').addEventListener('input',e=>applyChange('split',Number(e.target.value)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>applyChange('view',b.dataset.view)));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mode==='auto3')fog3.last=0;applyChange('processing',b.dataset.mode)}));
  document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>applyChange('scene',b.dataset.scene)));
  $('algorithm').addEventListener('change',e=>applyChange('algorithm',Number(e.target.value)));
  $('strength').addEventListener('input',e=>applyChange('strength',Number(e.target.value)));
  document.querySelectorAll('[data-strength]').forEach(b=>b.addEventListener('click',()=>applyChange('strength',Number(b.dataset.strength))));
  for(const name of ['haze','contrast','brightness','saturation','sky','detail'])$(name).addEventListener('input',e=>applyChange(name,Number(e.target.value)));
  $('scenePreset').addEventListener('change',e=>{settings.preset=e.target.value;if(PRESETS[settings.preset])Object.assign(settings,PRESETS[settings.preset]);persist();updateAll()});
  const reset=()=>{settings={...DEFAULT};persist();updateAll()};
  $('reset').addEventListener('click',()=>{Object.assign(settings,PRESETS.medium,{preset:'medium'});persist();updateAll()});
  $('restoreDefaults').addEventListener('click',reset);
  $('saveFrame').addEventListener('click',()=>{draw(performance.now());saveCanvas(els.processed,'dehaze_processed')});
  $('saveOriginal').addEventListener('click',()=>{draw(performance.now());saveCanvas(els.original,'dehaze_original')});
  $('fullScreen').addEventListener('click',()=>{const v=els.viewer; if(document.fullscreenElement)document.exitFullscreen?.();else if(v.requestFullscreen)v.requestFullscreen();else if(v.webkitEnterFullscreen)v.webkitEnterFullscreen();else setStatus('Повноекранний режим не підтримується цим браузером.','error')});
  window.addEventListener('pagehide',()=>{if(stream)stream.getTracks().forEach(t=>t.stop());});
}

async function start(){wire();updateAll();
  try{gpu=new DehazeGL(els.processed);await gpu.initialize();$('gpuTag').textContent='GPU: WebGL активний';$('gpuTag').title=`Макс. текстура: ${gpu.maxTextureSize}`;setStatus('GPU-шейдер готовий. Можна відкривати локальні фото, відео або камеру.','ok');}
  catch(e){$('gpuTag').textContent='GPU: помилка';$('gpuTag').style.background='#682e35';setStatus(e.message+' Запусти через HTTPS/localhost, перевір WebGL та браузер.','error');}
  await cameraList();requestAnimationFrame(tick);
  if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
start();
