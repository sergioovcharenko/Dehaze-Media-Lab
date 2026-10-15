(() => {
  const init=()=>{
    // No scrim: prevents interception of settings touches and leaves video bright.
    const nav=document.createElement('div');nav.className='tablet-nav';nav.innerHTML='<span class="tag">DEHAZE LAB · APK</span><button type="button" id="tabletHide" title="Приховати елементи керування">◫</button><button type="button" id="tabletSettings" title="Налаштування алгоритмів">⚙</button>';
    document.body.appendChild(nav);
    const camera=document.querySelector('.camera-options');
    const metrics=document.querySelector('.metrics');
    const message=document.querySelector('.message');
    const settings=document.querySelector('aside.settings');
    if(camera && settings)settings.appendChild(camera);
    if(metrics && settings)settings.appendChild(metrics);
    if(message && settings)settings.appendChild(message);
    // Put settings directly under body: no parent stacking context can sit behind a touch-intercepting overlay.
    if(settings){document.body.appendChild(settings);settings.style.pointerEvents='auto';}
    const settingsButton=document.getElementById('tabletSettings');
    const togglePanel=()=>{
      document.body.classList.toggle('panel-open');
      settingsButton.setAttribute('aria-expanded',String(document.body.classList.contains('panel-open')));
    };
    settingsButton.setAttribute('aria-expanded','false');
    settingsButton.addEventListener('click',togglePanel);
    document.addEventListener('pointerdown',event=>{
      if(!document.body.classList.contains('panel-open'))return;
      if(settings?.contains(event.target)||nav.contains(event.target))return;
      document.body.classList.remove('panel-open');
      settingsButton.setAttribute('aria-expanded','false');
    },{passive:true});
    document.getElementById('tabletHide').addEventListener('click',()=>{
      const hidden=document.body.classList.toggle('controls-hidden');
      document.getElementById('tabletHide').textContent=hidden?'▣':'◫';
    });
    // WebView does not consistently support blob: anchor downloads; redirect PNG to Android MediaStore.
    document.addEventListener('click',event=>{
      const a=event.target.closest?.('a[download]');
      if(!a || !window.AndroidBridge || !a.href.startsWith('blob:')) return;
      event.preventDefault();
      fetch(a.href).then(r=>r.blob()).then(blob=>new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);
      })).then(data=>window.AndroidBridge.savePng(data,a.download||'dehaze.png')).catch(e=>console.error('PNG save failed',e));
    },true);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
