(()=>{
 const key='inventory-color-mode',root=document.documentElement,preference=matchMedia('(prefers-color-scheme: dark)');
 const saved=()=>{try{return localStorage.getItem(key);}catch{return null;}};
 const apply=theme=>{
  root.dataset.theme=theme;
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
   const dark=theme==='dark';button.setAttribute('aria-pressed',String(dark));button.title=`Switch to ${dark?'light':'dark'} mode`;
   button.innerHTML=`<span aria-hidden="true">${dark?'☀':'☾'}</span><span>${dark?'Light mode':'Dark mode'}</span>`;
  });
 };
 const initial=saved();apply(initial==='dark'||initial==='light'?initial:preference.matches?'dark':'light');
 const followSystem=()=>{const value=saved();if(value!=='light'&&value!=='dark')apply(preference.matches?'dark':'light');};
 preference.addEventListener('change',followSystem);
 window.addEventListener('storage',event=>{if(event.key===key){const value=saved();apply(value==='dark'||value==='light'?value:preference.matches?'dark':'light');}});
 document.addEventListener('click',event=>{
  const toggle=event.target.closest('[data-theme-toggle]');
  if(toggle){const next=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,next);}catch{}apply(next);return;}
  const input=event.target;
  if(input instanceof HTMLInputElement&&input.type==='date'&&!input.readOnly&&!input.disabled&&typeof input.showPicker==='function'){
   try{input.showPicker();}catch{/* Native calendar indicator and keyboard entry remain available. */}
  }
 });
 const ready=()=>{
  apply(root.dataset.theme);
  const clock=document.querySelector('#live-clock');if(!clock)return;
  const date=new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  const time=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const tick=()=>{const now=new Date();clock.dateTime=now.toISOString();clock.querySelector('[data-live-date]').textContent=date.format(now);clock.querySelector('[data-live-time]').textContent=time.format(now);clock.title='Local time · '+Intl.DateTimeFormat().resolvedOptions().timeZone;};
  tick();setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
