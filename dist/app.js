import {localISODate} from './date-utils.js';
import {cuttingJobSheet} from './cutting-job-sheet.js';
import {coilLabel} from './coil-label.js';
import {CUTTING,coilsFrom,calculateCutting,cuttingStock,maximumStrips,optimizeLayout,appendCut,snapshotCuts} from './cutting.js';
import {menus,definitions,reportSources,reportOptions} from './data.js';

const nativeFetch=window.fetch.bind(window);
const authResponse=await nativeFetch('/api/auth/session');
if(!authResponse.ok){location.replace('/login');throw Error('Sign in required');}
const {csrf}=await authResponse.json();
window.fetch=async(input,options={})=>{
 const headers=new Headers(options.headers);
 if(['POST','PUT','DELETE','PATCH'].includes((options.method||'GET').toUpperCase()))headers.set('X-CSRF-Token',csrf);
 const response=await nativeFetch(input,{...options,headers});
 if(response.status===401){location.replace('/login');throw Error('Session expired. Please sign in again.');}
 return response;
};
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'){try{const response=await fetch('/api/auth/session');if(!response.ok)location.replace('/login');}catch{}}});
const $ = s => document.querySelector(s);
const desktop = $('#desktop'), modal = $('#modal');
const key = 'sst-inventory-local-v1';
let store = {}, current = null, index = 0, editing = false, adding = false, query = '', lineDraft = [];
let revision=1;
try {
 const response=await fetch('/api/data');if(!response.ok)throw Error('Local database is unavailable. Restart the local server.');
 const data=await response.json();store=data.tables;revision=data.revision;
 let legacy={};try{legacy=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
 if(revision===1&&Object.keys(legacy).length){
  const migrated=await fetch('/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,tables:{...store,...legacy}})});
  if(migrated.ok){store={...store,...legacy};revision=(await migrated.json()).revision;localStorage.removeItem(key);}
 }
}catch(error){desktop.innerHTML='<div class="form-window"><div class="window-body"><h2>Local database unavailable</h2><p>Restart the server with npm start, then reload this page.</p></div></div>';throw error;}
const clone = value => structuredClone(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fieldsFor = d => d.fields || ['Code','Name'];
const rowsFor = name => store[name] || definitions[name]?.rows || [];
const filtered = name => rowsFor(name).map((r,i)=>({r,i})).filter(({r})=>Object.values(r).join(' ').toLowerCase().includes(query.toLowerCase()));
function status(message){$('#status').textContent=message;}
async function persist(){
 try{
  const response=await fetch('/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,tables:store})});
  if(response.status===409){
   const latest=await (await fetch('/api/data')).json();store=latest.tables;revision=latest.revision;editing=false;adding=false;render();
   textMessage('Data changed in another window','The latest database records have been loaded. Re-enter your change before saving.');return false;
  }
  if(!response.ok)throw Error((await response.json()).error||'Database save failed');
  const saved=await response.json();revision=saved.revision;if(saved.tables)store=saved.tables;return true;
 }catch(error){textMessage('Database save failed',error.message+' Your changes remain in this page; export local data for a backup.');return false;}
}
function message(title,content,actions=[]){
 modal.innerHTML=`<h2>${esc(title)}</h2><div>${content}</div><div class="actions">${actions.map((a,i)=>`<button class="plain-button" data-modal-action="${i}">${esc(a.label)}</button>`).join('')}<button class="plain-button" data-close>Close</button></div>`;
 if(!modal.open)modal.showModal();
 modal.querySelector('[data-close]').onclick=()=>modal.close();
 actions.forEach((a,i)=>modal.querySelector(`[data-modal-action="${i}"]`).onclick=()=>{modal.close();a.run();});
}
function textMessage(title,text){message(title,`<p>${esc(text)}</p>`);}
function closeMenus(){document.querySelectorAll('.menu.open').forEach(e=>{e.classList.remove('open');e.firstElementChild.setAttribute('aria-expanded','false');});}
for(const [name,entries] of Object.entries(menus)){
 const menu=document.createElement('div');menu.className='menu';
 menu.innerHTML=`<button aria-haspopup="menu" aria-expanded="false">${esc(name)}</button><div class="dropdown" role="menu">${entries.map(entry=>entry==='-'?'<hr>':`<button role="menuitem" data-screen="${esc(entry)}">${esc(entry)}</button>`).join('')}</div>`;
 const toggle=menu.firstElementChild;
 toggle.onclick=e=>{e.stopPropagation();const was=menu.classList.contains('open');closeMenus();menu.classList.toggle('open',!was);toggle.setAttribute('aria-expanded',String(!was));};
 toggle.onmouseenter=()=>{if(document.querySelector('.menu.open')){closeMenus();menu.classList.add('open');toggle.setAttribute('aria-expanded','true');}};
 menu.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>{closeMenus();navigate(b.dataset.screen);});
 $('#menubar').append(menu);
}
const logoutButton=document.createElement('button');
logoutButton.textContent='Sign out';logoutButton.className='plain-button';logoutButton.style.marginLeft='auto';
logoutButton.onclick=async()=>{try{const response=await fetch('/api/auth/logout',{method:'POST'});if(response.ok)location.replace('/login');}catch{status('Unable to sign out. Try again.');}};
$('#menubar').append(logoutButton);
document.addEventListener('click',e=>{if(!e.target.closest('.menu'))closeMenus();});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){closeMenus();if(!modal.open&&current&&!editing)closeWindow();}
 if(e.key==='ArrowDown'&&e.target.parentElement?.classList.contains('menu')){e.preventDefault();e.target.parentElement.classList.add('open');e.target.setAttribute('aria-expanded','true');e.target.parentElement.querySelector('[role=menuitem]')?.focus();}
 if(e.target.matches('[role=menuitem]')&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const items=[...e.target.parentElement.querySelectorAll('[role=menuitem]')];items[(items.indexOf(e.target)+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}
});
function navigate(name){
 if(name==='GRN Item Setup')name='Item Master Setup';
 if(editing){message('Unsaved local changes','<p>Discard the changes to this local record?</p>',[{label:'Discard and continue',run:()=>{editing=false;navigate(name);}}]);return;}
 if(name==='Dashboard'){closeWindow();return;}
 if(name==='About this local copy'){coverage();return;}
 if(name==='Captured screens'){captures();return;}
 if(name==='Export local data'){exportJSON();return;}
 if(name==='Import local data'){importJSON();return;}
 current=name;index=0;editing=false;adding=false;query='';
 location.hash=encodeURIComponent(name);
 render();
}
function closeWindow(){
 if(editing){message('Unsaved local changes','<p>Discard the changes to this local record?</p>',[{label:'Discard and close',run:()=>{editing=false;closeWindow();}}]);return;}
 current=null;$('#tasks').textContent='Inventory and Production System';$('#tasks').onclick=null;history.replaceState(null,'',location.pathname);renderDashboard();status('Ready');
}
function createWindow(title){
 desktop.innerHTML=`<section class="form-window" aria-label="${esc(current)}"><div class="titlebar"><span class="app-icon" aria-hidden="true">▦</span><span class="screen-title">${esc(title||current)}</span><div class="controls"><button data-min aria-label="Minimize">−</button><button data-max aria-label="Maximize">□</button><button class="close" data-exit aria-label="Close window">×</button></div></div><div class="window-body"></div></section>`;
 updateNavigation();
 const win=desktop.firstElementChild, titlebar=win.firstElementChild;
 win.querySelector('[data-exit]').onclick=closeWindow;
 win.querySelector('[data-max]').onclick=()=>win.classList.toggle('maximized');
 win.querySelector('[data-min]').onclick=()=>{win.hidden=true;status('Window minimized — click the task name to restore');};
 $('#tasks').onclick=()=>{win.hidden=false;};
 titlebar.ondblclick=()=>win.classList.toggle('maximized');
 titlebar.onpointerdown=e=>{
  if(e.target.closest('button')||win.classList.contains('maximized')||matchMedia('(max-width: 900px)').matches)return;
  const left=win.offsetLeft,top=win.offsetTop,startX=e.clientX,startY=e.clientY;
  titlebar.setPointerCapture(e.pointerId);
  titlebar.onpointermove=m=>{win.style.left=Math.max(0,Math.min(desktop.clientWidth-120,left+m.clientX-startX))+'px';win.style.top=Math.max(0,Math.min(desktop.clientHeight-50,top+m.clientY-startY))+'px';};
  titlebar.onpointerup=()=>titlebar.onpointermove=null;
 };
 $('#tasks').textContent=current;
 return win.querySelector('.window-body');
}
function render(){
 if(current==='Coil & Strip Stock')return renderCoilStock();
 if(reportSources[current])return renderReport();
 if(menus['System Admin'].includes(current))return renderAdmin();
 const d=definitions[current];if(!d)return;
 const body=createWindow(current);
 const records=rowsFor(current);index=Math.min(index,Math.max(0,records.length-1));
 const record=adding?{}:records[index]||{};
 const cuttingLocked=current===CUTTING&&['Posted','Void'].includes(record['Cutting Status']);
 const priority=['Code','Date','Coil Reference','Processed Weight','Trim Disposition','Cutting Status'];
 const fields=current===CUTTING?[...priority,...fieldsFor(d).filter(f=>!priority.includes(f))]:fieldsFor(d);
 const fieldMarkup=fields.map((f,i)=>{
   const label=current===CUTTING&&f==='Processed Weight'?(editing?'Weight for next cut (kg)':'Total processed weight (kg)'):current===CUTTING&&f==='Weight'?'Calculated weight (kg)':f==='Code'||f==='Name'?`${d.prefix} ${f}`:f;
   const id='field-'+i,value=current===CUTTING&&editing&&f==='Processed Weight'&&record._lines?.some(l=>l['Cut Weight']!==undefined)?'':record[f]??(adding&&f==='Date'?localISODate():'');
   const source={'Company Name':'Company Setup','Main Category':'Item Main Category','Sub Category':'Item Sub Category','Thickness':'Thickness Setup','Pack Size':'Unit Setup','Supplier':'Supplier Setup','Buyer':'Buyer Setup','Department':'Department Creation'}[f];
   const options=f==='Coil Reference'?[...coilsFrom(store).keys()]:f==='Trim Disposition'?['Scrap','Reusable']:f==='Cutting Status'?['Draft']:source?rowsFor(source).map(r=>r.Name):f==='Item Type'?['RM','FG']:f==='Imported/Local'?['Imported','Local']:f==='Supplier Type'?['FG','RM']:null;
   const attributes=`id="${id}" data-field="${esc(f)}" ${editing?'':'readonly'} ${f==='Code'&&editing?'required':''}`;
   let input=options?`<select id="${id}" data-field="${esc(f)}" ${editing?'':'disabled'}>${[...new Set([value,...options])].map(v=>`<option ${v===value?'selected':''}>${esc(v)}</option>`).join('')}</select>`:f==='Remarks'?`<textarea ${attributes}>${esc(value)}</textarea>`:`<input ${attributes} value="${esc(value)}" ${f==='Date'||f.endsWith(' Date')?'type="date"':current===CUTTING&&f==='Processed Weight'?'type="number" min="0.001" step="any" placeholder="e.g. 1000"':''}>`;
   return `<div class="field ${f==='Code'?'code':''}"><label for="${id}">${esc(label)}:</label>${input}</div>`;
 });
 const fieldHtml=fieldMarkup.join('');
 const legend=`<legend>${esc(d.heading||'Record details')}</legend>`;
 if(d.wide||d.kind==='transaction'){
  lineDraft=clone(record._lines||[]);
  body.innerHTML=`<fieldset class="wide-fields ${d.kind==='transaction'?'transaction-fields':''} ${d.accent?'accent':''}">${legend}${fieldHtml}</fieldset>${d.kind==='transaction'?'<div class="transaction-grid"><div class="section-heading"><h2>Line items</h2><p>Submit each line, then Save the document.</p></div><div id="line-items"></div></div>':''}`;
  if(d.kind==='transaction')renderLines(d);
 }else body.innerHTML=`<div class="setup-layout"><fieldset class="fields">${legend}${fieldHtml}</fieldset><section class="setup-records"><div class="section-heading"><h2>Records</h2><span>${records.length} total</span></div><label class="table-search">Search records<input id="setup-search" type="search" value="${esc(query)}" placeholder="Search code, name or details…" ${editing?'disabled':''}></label><div id="setup-table">${tableHtml(current)}</div></section></div>`;
 body.insertAdjacentHTML('afterbegin',`<div class="record-context"><div><span class="record-mode ${editing?'is-editing':cuttingLocked?'is-locked':''}">${editing?'Unsaved changes':cuttingLocked?esc(record['Cutting Status']):'View mode'}</span><span class="record-identity">${adding?'New record':record.Code?'Record '+esc(record.Code):'No records yet'}</span></div><span class="context-count">${records.length?index+1:0} of ${records.length}</span></div>`);
 if(d.kind==='transaction')body.querySelector('.record-context').insertAdjacentHTML('afterend',`<div class="workflow-guide"><span>1. ${current===CUTTING?'Select coil':'Receipt details'}</span><span>2. ${current===CUTTING?'Enter cutting layout':'Enter line items'}</span><span>3. Review &amp; Save</span><span>4. ${current===CUTTING?'Post &amp; Print':'Print'}</span></div>`);
 if(d.note)body.insertAdjacentHTML('beforeend',`<details class="screen-notes"><summary>Screen notes</summary><p class="window-note">${esc(d.note)}</p></details>`);
 body.insertAdjacentHTML('beforeend',toolbarHtml());
 bindToolbar(body);bindRows(body);
 const tableSearch=body.querySelector('#setup-search');if(tableSearch)tableSearch.oninput=()=>{query=tableSearch.value;$('#setup-table').innerHTML=tableHtml(current);bindRows(body);};
 if(current===CUTTING){
  if(cuttingLocked)body.querySelectorAll('[data-action=Edit],[data-action=Delete]').forEach(b=>b.disabled=true);
  setupCutting(body,record);

 }
 status(editing?(adding?'Adding local record':'Editing local record'):`${current} · ${records.length?index+1:0} / ${records.length} captured or local records`);
}
function tableHtml(name){
 const d=definitions[name],cols=d.kind==='transaction'?['Code','Date','Description','Quantity','Weight']:['Code',fieldsFor(d).includes('Caption')?'Caption':'Name'];
 const results=filtered(name);
 return `<div class="table-box"><table class="record-table" aria-label="${esc(name)} records"><thead><tr><th class="row-arrow"></th>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${results.map(({r,i})=>`<tr data-index="${i}" tabindex="0" class="${i===index?'selected':''}"><td class="row-arrow">${i===index?'▸':''}</td>${cols.map((c,j)=>`<td class="${j===0?'row-code':''}">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>${results.length?'':'<div class="empty">No captured or local records</div>'}</div>`;
}
function bindRows(body){body.querySelectorAll('[data-index]').forEach(row=>{
 const select=()=>{if(editing)return;index=Number(row.dataset.index);render();};row.onclick=select;row.onkeydown=e=>{if(e.key==='Enter')select();};
});}
function renderLines(d){
 const originalFields=d.lineFields||['Item Code','Description','Quantity','Weight'];
 const grnFields=['Item Code','Item Description','Coil Type','Coil Code','Width','Weight','UOM','Grade','Batch No','Manuf Code','Hardness','Coil ID'];
 const fields=current==='GRN (Goods Received Note)'?grnFields:current===CUTTING?['Cut No','Cut Weight',...originalFields.filter(f=>!['Cut No','Cut Weight'].includes(f))]:originalFields;
 const container=$('#line-items');
 const labels=current==='GRN (Goods Received Note)'&&!editing;
 container.innerHTML=`${editing?`<div class="line-editor ${current==='GRN (Goods Received Note)'?'grn-line-editor':''}">${fields.filter(f=>current!==CUTTING||!['Cut No','Cut Weight'].includes(f)).map((f,i)=>`<label>${esc(current===CUTTING&&f==='Quantity'?'Number of strips':f)}${current==='GRN (Goods Received Note)'&&['Item Code','Item Description','Coil Type','Coil Code'].includes(f)?grnDropdown(f):current===CUTTING&&['Pipe Code','Strip Code'].includes(f)?`<select data-line-field="${esc(f)}" aria-label="Line ${esc(f)}"><option value="">Select…</option>${rowsFor(f==='Pipe Code'?'Pipe Size Setup':'Strip Size Setup').map(r=>`<option value="${esc(r.Code)}">${esc(r.Code)} · ${esc(r.Name)}</option>`).join('')}</select>`:`<input data-line-field="${esc(f)}" aria-label="Line ${esc(f)}" ${(current===CUTTING&&['Total Width','Weight'].includes(f))||(current==='GRN (Goods Received Note)'&&f==='Coil ID')?'readonly':''} ${current==='GRN (Goods Received Note)'&&f==='Coil ID'?'placeholder="Assigned on Save"':''}>`}</label>`).join('')}<button class="plain-button" id="add-line">Submit line</button></div>`:''}<div class="table-box"><table class="record-table" aria-label="Transaction line items"><thead><tr>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}${editing?'<th></th>':labels?'<th>Coil label</th>':''}</tr></thead><tbody>${lineDraft.map((line,i)=>`<tr>${fields.map(f=>`<td>${esc(line[f])}</td>`).join('')}${editing?`<td><button data-remove-line="${i}" aria-label="Remove line ${i+1}">×</button></td>`:labels?`<td><button class="plain-button" data-coil-label="${i}" ${line['Coil ID']||line['Manuf Code']?'':'disabled'}>Print coil label</button></td>`:''}</tr>`).join('')}</tbody></table>${lineDraft.length?'':'<div class="empty">No captured or local line items</div>'}</div>`;
 if(labels&&lineDraft.some(line=>line['Coil ID']||line['Manuf Code'])){const button=document.createElement('button');button.className='plain-button';button.id='receipt-coil-labels';button.textContent='Coil labels · Print / Save PDF';button.onclick=()=>renderCoilLabels(rowsFor(current)[index],lineDraft.findIndex(line=>line['Coil ID']||line['Manuf Code']));container.prepend(button);}
 if(labels)container.querySelectorAll('[data-coil-label]').forEach(button=>button.onclick=()=>renderCoilLabels(rowsFor(current)[index],Number(button.dataset.coilLabel)));
 if(editing){
  if(current==='GRN (Goods Received Note)')bindGRNDropdowns();
  $('#add-line').onclick=()=>{const line={};container.querySelectorAll('[data-line-field]').forEach(e=>line[e.dataset.lineField]=e.value.trim());if(!Object.values(line).some(Boolean))return;if(current==='GRN (Goods Received Note)'){
   const item=rowsFor('Item Master Setup').find(r=>r.Code===line['Item Code']);
   if(!item||!item.Description||line['Item Description']!==item.Code){textMessage('Item required','Select an item code or description from Setup → GRN Item Setup.');return;}
   const category=rowsFor('Item Main Category').find(r=>r.Code===line['Coil Code']);
   if(!category||line['Coil Type']!==category.Code){textMessage('Coil category required','Select a matching coil type and code from Setup → Item Main Category.');return;}
   line['Item Description']=item.Description;line['Coil Type']=category.Name;
  }if(current===CUTTING){try{
   const job=appendCut(cuttingForm(),[line],$('[data-field="Processed Weight"]').value),coil=cuttingStock(store).coils.get(job['Coil Reference']);
   const result=calculateCutting(job,coil);if(result.processed>coil.remainingWeight+1e-7)throw Error('Submitted cuts exceed available coil weight. Reduce this cut weight.');
   lineDraft=result.lines;renderLines(d);bindCuttingLines();return;
  }catch(error){showCuttingError(error);return;}}lineDraft.push(line);renderLines(d);if(current===CUTTING)bindCuttingLines();};
  container.querySelectorAll('[data-remove-line]').forEach(b=>b.onclick=()=>{const removed=lineDraft[Number(b.dataset.removeLine)];if(current===CUTTING&&removed?.['Cut No'])lineDraft=lineDraft.filter(l=>l['Cut No']!==removed['Cut No']);else lineDraft.splice(Number(b.dataset.removeLine),1);renderLines(d);if(current===CUTTING)bindCuttingLines();});
 }
}
const tools=['First','Previous','Next','Last','Add','Edit','Delete','Undo','Save','Search','Exit','Report'];
function toolbarHtml(){
 const count=rowsFor(current).length;
 return `<div class="toolbar">${tools.map((name,i)=>{
 const disabled=editing?['First','Previous','Next','Last','Add','Edit','Delete','Search','Report'].includes(name):['Undo','Save'].includes(name)||(!count&&['First','Previous','Next','Last','Edit','Delete'].includes(name));
 return `<button class="tool" title="${name}" aria-label="${name}" data-action="${name}" ${disabled?'disabled':''}><span aria-hidden="true" class="sprite" style="background-position:-${i*76}px 0"></span></button>`;
 }).join('')}${current==='Strip Size Setup'?'<button class="plain-button" data-action="Opening Stock" '+(editing||!count?'disabled':'')+'>Opening Stock</button>':''}<span class="record-count">${editing?'Save or Undo to finish editing':`${count?index+1:0} / ${count}`}</span></div>`;
}
function bindToolbar(body){body.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));}
async function action(name){
 const rows=rowsFor(current),d=definitions[current];
 if(current===CUTTING&&['Posted','Void'].includes(rows[index]?.['Cutting Status'])&&['Edit','Delete'].includes(name)){textMessage('Cutting job locked','Void a posted job and create a replacement to correct it.');return;}
 if(name==='Exit')return closeWindow();
 if(name==='First')index=0;
 if(name==='Previous')index=Math.max(0,index-1);
 if(name==='Next')index=Math.min(rows.length-1,index+1);
 if(name==='Last')index=rows.length-1;
 if(name==='Add'){editing=true;adding=true;}
 if(name==='Edit'){editing=true;adding=false;}
 if(name==='Opening Stock'){editing=true;adding=false;}
 if(name==='Undo'){editing=false;adding=false;}
 if(name==='Delete'){
  message('Delete local record',`<p>Delete ${esc(rows[index]?.Code)} from this local database?</p>`,[{label:'Delete local record',run:async()=>{store[current]=clone(rows);store[current].splice(index,1);if(await persist())render();}}]);return;
 }
 if(name==='Save'){
  const beforeSave=clone(store),beforeRevision=revision;
  const record={};document.querySelectorAll('[data-field]').forEach(e=>record[e.dataset.field]=e.value.trim());
  if(d.kind==='transaction')record._lines=clone(lineDraft);
  if(current===CUTTING){record['Cutting Status']='Draft';if(record['Coil Reference']&&record._lines.length){try{const result=calculateCutting(record,coilsFrom(store).get(record['Coil Reference']));record._lines=result.lines;record['Processed Weight']=String(result.processed);const coil=coilsFrom(store).get(record['Coil Reference']);Object.assign(record,{Width:String(coil.width),Weight:String(result.processed),Utilize:String(result.usedWidth??''),Wastage:String(result.remainingWidth??''),'Wght MM':String(result.processed/coil.width)});}catch(error){showCuttingError(error);return;}}}
  if(!record.Code){textMessage('Record code required','Enter a code before saving.');return;}
  if(rows.some((r,i)=>r.Code===record.Code&&(adding||i!==index))){textMessage('Duplicate code','A local record already uses this code.');return;}
  record._origin='local';store[current]=clone(rows);if(adding){store[current].push(record);index=store[current].length-1;}else store[current][index]=record;
  if(!await persist()){if(revision===beforeRevision)store=beforeSave;return;}editing=false;adding=false;
 }
 if(name==='Search'){
  message('Search captured and local records',`<p><label for="search-query">Code, name, or any recorded field</label></p><input id="search-query" value="${esc(query)}" autofocus><div id="search-results"></div>`,[{label:'Clear search',run:()=>{query='';render();}}]);
  const input=$('#search-query'),results=$('#search-results');
  const update=()=>{query=input.value;results.innerHTML=`<p>${filtered(current).length} matches</p><div class="table-box" style="max-height:280px;min-height:80px"><table class="record-table"><tbody>${filtered(current).map(({r,i})=>`<tr data-result="${i}" tabindex="0"><td>${esc(r.Code)}</td><td>${esc(r.Name||r.Caption||r.Description||'')}</td></tr>`).join('')}</tbody></table></div>`;results.querySelectorAll('[data-result]').forEach(e=>{const select=()=>{index=Number(e.dataset.result);query='';modal.close();render();};e.onclick=select;e.onkeydown=k=>{if(k.key==='Enter')select();};});};
  input.oninput=update;update();return;
 }
 if(name==='Report'){renderRecordReport(current);return;}
 render();
 if(name==='Save')status('Saved · '+current+' · '+(rowsFor(current)[index]?.Code||''));
 if(editing){const code=$('[data-field="Code"]');if(adding&&code){const numeric=rows.map(r=>Number(r.Code)).filter(Number.isFinite);code.value=String(Math.max(0,...numeric)+1).padStart(rows[0]?.Code?.length||3,'0');}document.querySelector('[data-field]')?.focus();}
 if(name==='Opening Stock')$('[data-field="Open Quantity"]')?.focus();
}
function download(name,body,type){const blob=new Blob([body],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportJSON(){download('inventory-local-data.json',JSON.stringify({format:1,exportedAt:new Date().toISOString(),tables:Object.fromEntries(Object.keys(definitions).map(name=>[name,rowsFor(name)]))},null,2),'application/json');status('Exported local data');}
function importJSON(){
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
 input.onchange=async()=>{try{
  const data=JSON.parse(await input.files[0].text());
  if(data.format!==1||!data.tables||typeof data.tables!=='object')throw Error('Expected an exported local inventory JSON file.');
  const clean={};for(const [name,rows] of Object.entries(data.tables)){
   if(!Object.hasOwn(definitions,name)||!Array.isArray(rows))throw Error('Unrecognized table.');
   const codes=new Set();clean[name]=rows.map(r=>{if(!r||typeof r!=='object'||Array.isArray(r)||!String(r.Code??'').trim())throw Error('Every record must have a code.');const result={};for(const f of fieldsFor(definitions[name])){if(r[f]!=null&&typeof r[f]!=='string'&&typeof r[f]!=='number')throw Error('Invalid field value.');result[f]=String(r[f]??'');}if(codes.has(result.Code))throw Error('Duplicate record code.');codes.add(result.Code);if(definitions[name].kind==='transaction'){if(r._lines!=null&&!Array.isArray(r._lines))throw Error('Invalid transaction lines.');result._lines=(r._lines||[]).map(line=>{const cleanLine={};for(const f of definitions[name].lineFields||['Item Code','Description','Quantity','Weight']){if(line[f]!=null&&typeof line[f]!=='string'&&typeof line[f]!=='number')throw Error('Invalid line value.');cleanLine[f]=String(line[f]??'');}return cleanLine;});}result._origin='local';return result;});
  }
  message('Import local data',`<p>Replace ${Object.keys(clean).length} local tables with this file’s records?</p>`,[{label:'Import',run:async()=>{store={...store,...clean};if(await persist()){if(current)render();status('Imported local data');}}}]);
 }catch(e){textMessage('Import failed',e.message);}};
 input.click();
}
function renderReport(){renderRecordReport(reportSources[current],true);}
function renderRecordReport(source,isMenu=false){
 const title=isMenu?current:source+' — Report';
 const body=createWindow(title),fields=[...new Set([...fieldsFor(definitions[source]),...(definitions[source].lineFields||[])])];
 const options=isMenu?reportOptions[current]||{}:{};
 const hasDate=!options.noDates&&(isMenu||fields.includes('Date'));
 const flattened=rowsFor(source).flatMap(r=>r._lines?.length?r._lines.map(line=>({...r,...line})):r);
 const valueFor=(r,field)=>field==='pipe'?(r['Pipe Description']||r['Product Description']||r.Description||r['Item Description']||''):field==='thickness'?(r['Thick Name']||r['Thickness Desc.']||r.Thickness||''):field==='buyer'?(r.Buyer||''):field==='supplier'?(r.Supplier||''):r.Issue||'';
 const labels={pipe:'Pipe Name',thickness:'Thickness Name',buyer:'Buyer',supplier:'Supplier',issue:'Issue Y/N'};
 const filters=Object.keys(labels).filter(f=>options[f]);
 const filterHtml=filters.map(f=>`<label>${labels[f]}<select data-report-filter="${f}"><option value="">All captured values</option>${[...new Set(flattened.map(r=>valueFor(r,f)).filter(Boolean))].map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>`).join('');
 body.innerHTML=`<div class="report-filters"><label>Search<input id="report-search" placeholder="Filter captured / local records"></label>${hasDate?'<label>Period From<input id="from-date" type="date"></label><label>Period To<input id="to-date" type="date"></label>':''}${filterHtml}${options.summary?'<label>Summary<select id="report-summary"><option value="detail">Detail</option><option value="pipe">Pipe Wise Summary</option><option value="thickness">Pipe & Thickness Wise Summary</option></select></label>':''}<button class="plain-button" id="preview-report">Preview</button></div><article class="report-page"><h2>${esc(title)}</h2><div class="report-meta">Local copy · source: ${esc(source)} · captured and locally entered records only</div><div id="report-data"></div></article><div class="report-actions"><button class="plain-button" id="print-report">Print / Save PDF</button><button class="plain-button" id="csv-report">Export CSV</button><button class="plain-button" id="back-report">${isMenu?'Exit':'Back to records'}</button></div><p class="window-note">This report is a local substitute. Live stock calculations, server joins, report templates, and uncaptured records are unavailable. Blank values indicate fields not captured.</p>`;
 let results=[],reportFields=fields;
 const update=()=>{
  const term=$('#report-search').value.toLowerCase(),from=$('#from-date')?.value,to=$('#to-date')?.value;
  results=flattened.filter(r=>Object.values(r).join(' ').toLowerCase().includes(term)&&(!from||(r.Date&&r.Date>=from))&&(!to||(r.Date&&r.Date<=to))&&[...body.querySelectorAll('[data-report-filter]')].every(select=>!select.value||valueFor(r,select.dataset.reportFilter)===select.value));
  reportFields=fields;
  const summary=$('#report-summary')?.value;
  if(summary&&summary!=='detail'){
   const groups=new Map();
   for(const row of results){
    const pipe=valueFor(row,'pipe'),thickness=summary==='thickness'?valueFor(row,'thickness'):'',id=JSON.stringify([pipe,thickness]);
    if(!groups.has(id))groups.set(id,{Pipe:pipe,...(summary==='thickness'?{Thickness:thickness}:{}),Quantity:0,Weight:0,Rows:0});
    const group=groups.get(id);group.Quantity+=Number(row.Quantity??row['Quantity in Hand'])||0;group.Weight+=Number(row.Weight)||0;group.Rows++;
   }
   results=[...groups.values()];reportFields=['Pipe',...(summary==='thickness'?['Thickness']:[]),'Quantity','Weight','Rows'];
  }
  const cols=reportFields.filter(f=>results.some(r=>r[f]!==undefined&&r[f]!==''));
  $('#report-data').innerHTML=results.length?`<div style="overflow:auto"><table class="record-table"><thead><tr>${cols.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${results.map(r=>`<tr>${cols.map(f=>`<td>${esc(r[f])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="totals">${results.length} records${fields.includes('Quantity')?' · Quantity: '+results.reduce((s,r)=>s+(Number(r.Quantity)||0),0):''}${fields.includes('Weight')?' · Weight: '+results.reduce((s,r)=>s+(Number(r.Weight)||0),0):''}</div>`:'<p class="empty">No captured or local records match these filters.</p>';
 };
 $('#preview-report').onclick=update;$('#report-search').oninput=update;body.querySelectorAll('[data-report-filter],#report-summary').forEach(select=>select.onchange=update);
 $('#print-report').onclick=()=>window.print();
 $('#csv-report').onclick=()=>{
  const csv=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  download(title.replaceAll(/[^a-z0-9]/gi,'-')+'.csv',[reportFields,...results.map(r=>reportFields.map(f=>r[f]??''))].map(row=>row.map(csv).join(',')).join('\r\n'),'text/csv;charset=utf-8');
 };
 $('#back-report').onclick=isMenu?closeWindow:render;update();status(title+' · local report');
}
function renderAdmin(){const body=createWindow(current);body.innerHTML=`<div class="admin-message"><h2>${esc(current)}</h2><p>The original user accounts, administrator codes, and permissions were not copied.</p><p>This application requires a local account. Manage accounts with the server’s user:set command. The original administration workflow is unavailable.</p><button class="plain-button" id="admin-close">Exit</button></div>`;$('#admin-close').onclick=closeWindow;status('Administration not reproduced');}
function coverage(){message('About this local copy',`<p><strong>Inventory and Production System</strong> — private local recreation.</p><p>The original site streams a Windows application into a canvas. This version recreates its menus and forms using captured screenshots and transcribed visible records.</p><ul><li>Setup navigation, record selection, search, First/Previous/Next/Last, local Add/Edit/Delete/Undo/Save, CSV reports, printing, and JSON import/export work locally.</li><li>Only observed records are included. Uncaptured fields remain blank. Additional server records were not downloaded.</li><li>Transaction forms and reports are local substitutes; server calculations and live inventory updates are unavailable.</li><li>Original user accounts and permissions are unavailable. No passwords, cookies, or session tokens are included.</li><li>Changes persist in the local SQLite database at data/inventory.sqlite. Use Export local data to make a backup.</li></ul><p>No external services are required. This copy does not contact the original server.</p>`);}
function captures(){const entries=Object.entries(definitions).filter(([,d])=>d.capture);message('Captured screens',`<p>Original visible screens captured from the authorized session. Some captures contain incomplete remote rendering.</p><div class="capture-list">${entries.map(([name,d])=>`<a href="/reference/${esc(d.capture)}.png" target="_blank" rel="noopener">${esc(name)}</a>`).join('')}</div>`);}
$('#coverage').onclick=coverage;
const initial=decodeURIComponent(location.hash.slice(1));if(initial==='Coil & Strip Stock'||definitions[initial]||reportSources[initial]||menus['System Admin'].includes(initial))navigate(initial);else renderDashboard();
window.addEventListener('hashchange',()=>{const name=decodeURIComponent(location.hash.slice(1));if(name&&name!==current&&(definitions[name]||reportSources[name]))navigate(name);});
window.addEventListener('beforeunload',e=>{if(editing){e.preventDefault();e.returnValue='';}});

function cuttingForm(){
 const job={};document.querySelectorAll('[data-field]').forEach(e=>job[e.dataset.field]=e.value);
 job._lines=clone(lineDraft);
 if(editing&&job._lines.length&&!job._lines.some(l=>l['Cut Weight']!==undefined)){
  const saved=!adding?rowsFor(CUTTING)[index]:null;
  if(Number(saved?.['Processed Weight'])>0)job._lines=snapshotCuts(job._lines,saved['Processed Weight']);
 }
 return job;
}
function setupCutting(body,record){
 body.insertAdjacentHTML('afterbegin','<section class="cutting-summary" aria-live="polite"><h3>Coil and cutting calculations</h3><div id="cutting-summary"></div><div id="cutting-actions"></div></section>');
 const input=f=>body.querySelector(`[data-field="${f}"]`);
 if(editing){
  if(input('Cutting Status'))input('Cutting Status').disabled=true;
  for(const f of ['Width','Weight','Utilize','Wastage','Wght MM'])if(input(f))input(f).readOnly=true;
  if(!input('Trim Disposition').value)input('Trim Disposition').value='Scrap';
  const lookup=document.createElement('div');lookup.className='coil-id-lookup';
  lookup.innerHTML=`<label for="find-coil-id">Find coil by full ID</label><input id="find-coil-id" list="coil-id-options" placeholder="C-001-00002-2026" autocomplete="off"><datalist id="coil-id-options">${[...cuttingStock(store).coils.values()].map(coil=>`<option value="${esc(coil.line['Coil ID']||coil.line['Manuf Code'])}">${esc(coil.label)}${coil.remainingWeight<=1e-7?' · Already consumed':''}</option>`).join('')}</datalist><span id="coil-id-result" role="status"></span>`;
  $('#cutting-summary').before(lookup);
  const tools=document.createElement('div');tools.id='cutting-layout-tools';tools.innerHTML='<div id="strip-fit-summary"></div><button class="plain-button" id="maximum-strips" disabled>Use maximum for this strip width</button> <button class="plain-button" id="suggest-cutting-layout">Suggest best mix of selected widths</button><p>Each Submit line records a separate cut with its own weight. A suggested mix submits its widths together as one new cut. Earlier cuts keep their recorded weights. No machine trim or kerf allowance is included.</p><div id="cutting-layout-suggestion"></div>';
  $('#cutting-summary').before(tools);
  $('#maximum-strips').onclick=()=>{try{const job=cuttingForm(),coil=coilsFrom(store).get(job['Coil Reference']),width=document.querySelector('[data-line-field="Strip Size"]')?.value;const fit=maximumStrips(coil.width,width,0);const input=document.querySelector('[data-line-field="Quantity"]');input.value=String(fit.count);input.dispatchEvent(new Event('input'));}catch(error){textMessage('Check strip width',error.message);}};
  $('#suggest-cutting-layout').onclick=suggestCuttingLayout;
  const findCoil=()=>{
   const value=$('#find-coil-id').value.trim().toUpperCase();if(!value){$('#coil-id-result').textContent='';return;}
   const matches=[...cuttingStock(store).coils.values()].filter(c=>String(c.line['Coil ID']||c.line['Manuf Code']).toUpperCase()===value);
   if(matches.length!==1){$('#coil-id-result').textContent=matches.length?'Multiple matches. Choose the receipt in Coil Reference.':'No coil found with this ID.';return;}
   input('Coil Reference').value=matches[0].reference;input('Coil Reference').dispatchEvent(new Event('change'));$('#coil-id-result').textContent=matches[0].remainingWeight<=1e-7?'Already consumed — select another coil.':'Coil selected.';
  };
  $('#find-coil-id').addEventListener('input',findCoil);$('#find-coil-id').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();findCoil();}});
  input('Coil Reference').querySelectorAll('option').forEach(option=>{const coil=cuttingStock(store).coils.get(option.value);if(coil){option.value=coil.reference;option.textContent=coil.label+(coil.remainingWeight<=1e-7?' · Already consumed':'');}});
  input('Coil Reference').addEventListener('change',()=>{
   const coil=cuttingStock(store).coils.get(input('Coil Reference').value);if(coil){
    $('#find-coil-id').value=coil.line['Coil ID']||coil.line['Manuf Code'];$('#coil-id-result').textContent=coil.remainingWeight<=1e-7?'Already consumed — select another coil.':'Coil selected.';
    for(const [f,v] of Object.entries({Width:coil.width,'Item Name':coil.line['Item Description'],'Item Code':coil.line['Item Code'],'Manuf Code':coil.line['Manuf Code'],'Batch No':coil.line['Batch No'],UOM:'KG'})){if(input(f))input(f).value=v||'';}
   }updateCuttingSummary();
  });
  body.querySelectorAll('[data-field]').forEach(e=>e.addEventListener('input',updateCuttingSummary));
  bindCuttingLines();
 }else{
  const actions=$('#cutting-actions');
  if(record.Code&&record['Cutting Status']!=='Void'){
   const posted=record['Cutting Status']==='Posted',button=document.createElement('button');button.className='plain-button';button.textContent=posted?'Void cutting':'Post cutting';
   button.onclick=()=>message(posted?'Void cutting job':'Post cutting job',`<p>${posted?'Reverse this job’s coil consumption and strip outputs?':'Consume the processed coil weight and record estimated strips and trim? The posted job will be locked.'}</p>`,[{label:posted?'Void job':'Post job',run:async()=>{
    const previous=clone(store),previousRevision=revision;try{
     const job=store[CUTTING][index];job['Cutting Status']=posted?'Void':'Posted';
     if(!posted){const result=calculateCutting(job,coilsFrom(store).get(job['Coil Reference']));job._lines=result.lines;job['Processed Weight']=String(result.processed);}
     cuttingStock(store);
     if(await persist()){render();if(!posted)renderCuttingSheet(store[CUTTING][index]);}else{if(revision===previousRevision)store=previous;render();}
    }catch(error){store=previous;textMessage('Unable to update cutting job',error.message);}
   }}]);actions.append(button);
  }
  if(record['Cutting Status']==='Posted'){const print=document.createElement('button');print.id='cutting-job-sheet';print.className='plain-button';print.textContent='Print labour job sheet';print.onclick=()=>renderCuttingSheet(record);actions.append(print);}
  updateCuttingSummary();
 }
}
function bindCuttingLines(){
 const field=f=>document.querySelector(`[data-line-field="${f}"]`);
 const set=(f,v)=>{if(field(f))field(f).value=v||'';};
 const useStrip=strip=>{
  if(!strip)return;set('Strip Code',strip.Code);set('Strip Name',strip.Name);set('Strip Size',strip.Size);set('Thick Code',strip['Thickness Code']);set('Thick Name',strip.Thickness);
  if(!field('Quantity').value)set('Quantity','1');
 };
 field('Pipe Code')?.addEventListener('change',()=>{
  const pipe=rowsFor('Pipe Size Setup').find(r=>r.Code===field('Pipe Code').value);set('Pipe Description',pipe?.Name);
  const strips=rowsFor('Strip Size Setup').filter(r=>r['Pipe Size Code']===pipe?.Code);
  set('Strip Code','');set('Strip Name','');set('Strip Size','');set('Thick Code','');set('Thick Name','');
  const select=field('Strip Code');select.innerHTML='<option value="">Select strip size…</option>'+strips.map(r=>`<option value="${esc(r.Code)}">${esc(r.Code)} · ${esc(r.Name)} · ${esc(r.Thickness)}</option>`).join('');
  if(strips.length===1)useStrip(strips[0]);updateCuttingSummary();
 });
 field('Strip Code')?.addEventListener('change',()=>{const strip=rowsFor('Strip Size Setup').find(r=>r.Code===field('Strip Code').value);useStrip(strip);if(strip){set('Pipe Code',strip['Pipe Size Code']);set('Pipe Description',strip['Pipe Size']);}updateCuttingSummary();});
 document.querySelectorAll('[data-line-field]').forEach(e=>e.addEventListener('input',updateCuttingSummary));
 updateCuttingSummary();
}
function updateCuttingSummary(){
 if(editing&&current===CUTTING)updateStripFit();
 const container=$('#cutting-summary');if(!container)return;
 try{
 const job=editing?cuttingForm():rowsFor(CUTTING)[index];
 const {coils,outputs}=cuttingStock(store),coil=coils.get(job?.['Coil Reference']);
 if(!coil){if(editing)lockConsumedCuttingFields(false);container.textContent='Select a coil received through GRN. Each tracked coil needs a Coil ID or Manuf Code, width in mm, weight in kg, and UOM KG. Existing historical cutting jobs do not consume stock.';return;}
 const f=n=>Number(n).toFixed(3);
 let html=`<p class="selected-coil"><strong>${esc(coil.label)}</strong></p><div class="coil-stock-metrics"><div><span>Original width: </span><strong>${f(coil.width)} mm</strong></div><div><span>Original weight: </span><strong>${f(coil.weight)} kg</strong></div><div><span>Available coil weight: </span><strong>${f(Math.max(0,coil.remainingWeight))} kg</strong></div></div>`;
 const consumed=coil.remainingWeight<=1e-7;
 if(editing){
  lockConsumedCuttingFields(consumed);const suggest=$('#suggest-cutting-layout');if(suggest)suggest.disabled=consumed;
 }
 const post=$('#cutting-actions button');if(post&&job['Cutting Status']!=='Posted')post.disabled=consumed;
 if(consumed){
  html+='<p class="cutting-error" role="status"><strong>Already consumed — this coil has no remaining weight.</strong> Select another coil for a new cutting job.</p>';
  if(editing){if($('#maximum-strips'))$('#maximum-strips').disabled=true;container.innerHTML=html;return;}
 }
 let result;
 try{
  const submitted=job._lines.length?calculateCutting(job,coil):null;
  result=submitted;let pendingPreview=false;
  if(editing){
   const pending={};document.querySelectorAll('[data-line-field]').forEach(e=>pending[e.dataset.lineField]=e.value);
   const weight=$('[data-field="Processed Weight"]').value;
   if(Number(pending['Strip Size'])>0&&Number(pending.Quantity)>0&&Number(weight)>0){result=calculateCutting(appendCut(job,[pending],weight),coil);pendingPreview=true;}
   if(submitted){
    lineDraft=submitted.lines;
    const fields=['Cut No','Cut Weight',...definitions[CUTTING].lineFields.filter(f=>!['Cut No','Cut Weight'].includes(f))];
    document.querySelectorAll('#line-items tbody tr').forEach((row,i)=>{for(const name of ['Cut No','Cut Weight','Total Width','Weight']){const cell=row.children[fields.indexOf(name)];if(cell&&lineDraft[i])cell.textContent=name==='Cut No'?lineDraft[i][name]||'1':lineDraft[i][name]===undefined?'':f(lineDraft[i][name]);}});
   }
  }
  if(!result){container.innerHTML=html+'<p>Enter the weight for this cut, strip width and strip count, then Submit line. Every submitted cut keeps its own weight.</p>';return;}
  if(editing)for(const [name,value] of Object.entries({Width:coil.width,Weight:result.processed,Utilize:result.usedWidth,Wastage:result.remainingWidth,'Wght MM':result.processed/coil.width})){const field=document.querySelector(`[data-field="${name}"]`);if(field)field.value=value===null?'':f(value);}
  const applied=['Posted','Void'].includes(job['Cutting Status']),deduct=applied?0:result.processed;
  if(result.cuts.length===1)html+=`<p>Layout used: ${f(result.usedWidth)} mm · <strong>Layout width remaining: ${f(result.remainingWidth)} mm</strong> · Utilization: ${result.utilization.toFixed(2)}%</p>`;
  else html+=`<p><strong>${result.cuts.length} separate cuts</strong> · Total processed weight: ${f(result.processed)} kg · Weight utilization: ${result.utilization.toFixed(2)}%</p>`;
  if(pendingPreview)html+='<p><strong>Preview includes the next, unsubmitted cut.</strong> Submitted cuts keep their recorded weights.</p>';
  html+=`<p>Estimated strips: ${f(result.outputWeight)} kg · ${esc(job['Trim Disposition'])}: ${f(result.trimWeight)} kg · Coil weight after this job: <strong>${f(coil.remainingWeight-deduct)} kg</strong></p>`;
  if(result.separateCuts){let remaining=coil.remainingWeight;html+='<div class="table-box cut-balance-table"><table class="record-table"><thead><tr><th>Cut</th><th>Cut weight kg</th><th>Used width mm</th><th>Unused width mm</th>'+(!applied?'<th>Coil kg after cut</th>':'')+'</tr></thead><tbody>'+result.cuts.map((cut,i)=>{remaining-=cut.processed;return `<tr><td>${cut.number}${pendingPreview&&i===result.cuts.length-1?' (preview)':''}</td><td>${f(cut.processed)}</td><td>${f(cut.usedWidth)}</td><td>${f(cut.remainingWidth)}</td>${!applied?`<td>${f(remaining)}</td>`:''}</tr>`;}).join('')+'</tbody></table></div>';}
  if(result.processed>coil.remainingWeight+1e-7&&!applied)html+='<p class="cutting-error">Insufficient coil stock. These cuts cannot be posted.</p>';
  if(editing&&pendingPreview){const last=result.lines.at(-1);const weight=document.querySelector('[data-line-field="Weight"]'),width=document.querySelector('[data-line-field="Total Width"]');if(weight)weight.value=f(last.Weight);if(width)width.value=f(last['Total Width']);}
 }catch(error){html+=`<p class="cutting-error">${esc(error.message)}</p>`;}

 const related=outputs.filter(o=>o.coil===coil.reference);
 if(related.length)html+='<details><summary>Posted strip, scrap and remnant outputs</summary><table class="record-table"><thead><tr><th>Job</th><th>Type</th><th>Width mm</th><th>Strips</th><th>Weight kg</th></tr></thead><tbody>'+related.map(o=>`<tr><td>${esc(o.job)}</td><td>${esc(o.type)}</td><td>${f(o.width)}</td><td>${o.quantity}</td><td>${f(o.weight)}</td></tr>`).join('')+'</tbody></table></details>';
 html+='<p>Unprocessed coil retains its original width. Estimates assume equal thickness and processed length; they do not represent actual weighed production.</p>';
 container.innerHTML=html;
 }catch(error){container.textContent=error.message;}
}

function renderCoilStock(){
 const body=createWindow('Coil & Strip Stock');
 try{
  const {coils,outputs}=cuttingStock(store),f=n=>Number(n).toFixed(3);
  body.innerHTML=`<h2>Coil stock</h2><p>Live balances from received coils and posted cutting jobs. Widths are mm; weights are kg. Draft and historical unposted jobs have no stock effect.</p><div class="table-box"><table class="record-table"><thead><tr><th>Receipt / Coil</th><th>Original width</th><th>Received weight</th><th>Processed weight</th><th>Remaining weight</th></tr></thead><tbody>${[...coils.values()].map(c=>`<tr><td>${esc(c.label)}</td><td>${f(c.width)}</td><td>${f(c.weight)}</td><td>${f(c.processedWeight)}</td><td>${f(c.remainingWeight)}</td></tr>`).join('')}</tbody></table></div><h2>Cutting outputs</h2><p>Estimated output ledger. These outputs are not yet deducted by production or deliveries.</p><div class="table-box"><table class="record-table"><thead><tr><th>Job</th><th>Coil</th><th>Type</th><th>Pipe</th><th>Width</th><th>Strips</th><th>Estimated weight</th></tr></thead><tbody>${outputs.map(o=>`<tr><td>${esc(o.job)}</td><td>${esc(o.coil)}</td><td>${esc(o.type)}</td><td>${esc(o.pipe||'')}</td><td>${f(o.width)}</td><td>${o.quantity}</td><td>${f(o.weight)}</td></tr>`).join('')}</tbody></table></div><div class="report-actions"><button class="plain-button" id="coil-refresh">Refresh</button><button class="plain-button" id="coil-print">Print / Save PDF</button></div>`;
  $('#coil-print').onclick=()=>window.print();
  $('#coil-refresh').onclick=async()=>{try{const response=await fetch('/api/data');if(!response.ok)throw Error('Unable to refresh inventory');const data=await response.json();store=data.tables;revision=data.revision;renderCoilStock();}catch(error){textMessage('Refresh failed',error.message);}};
 }catch(error){body.textContent=error.message;}
}

function renderCoilLabels(receipt,selected=0){
 const lines=receipt._lines||[];
 const printable=lines.map((line,i)=>({line,i})).filter(({line})=>line['Coil ID']||line['Manuf Code']);
 if(!printable.length){textMessage('Coil ID required','Enter a Coil ID or Manuf Code on the coil line and save the receipt before printing.');return;}
 const body=createWindow('Coil label — '+receipt.Code);
 body.classList.add('coil-label-view');
 body.innerHTML=`<div class="report-filters"><label>Coil to print<select id="coil-label-choice">${printable.map(({line,i})=>`<option value="${i}" ${i===selected?'selected':''}>${esc(line['Coil ID']||line['Manuf Code'])}</option>`).join('')}${printable.length>1?'<option value="all">All coils — one page each</option>':''}</select></label></div><div class="report-actions"><button class="plain-button" id="print-coil-label">Print / Save PDF</button><button class="plain-button" id="back-coil-label">Back to receipt</button></div><p class="window-note">A4 portrait · one full page per coil. Turn off browser headers and footers when printing. These are original receiving details.</p><div id="coil-label-pages"></div>`;
 const update=()=>{
  const selection=$('#coil-label-choice').value;
  $('#coil-label-pages').innerHTML=printable.filter(({i})=>selection==='all'||String(i)===selection).map(({line,i})=>coilLabel(receipt,line,i)).join('');
 };
 $('#coil-label-choice').onchange=update;
 $('#print-coil-label').onclick=()=>window.print();
 $('#back-coil-label').onclick=()=>render();
 update();status('Coil label · '+receipt.Code);
}

function showCuttingError(error){
 const weight=document.querySelector('[data-field="Processed Weight"]');
 const missingWeight=!weight?.value||!Number.isFinite(Number(weight.value))||Number(weight.value)<=0;
 message('Check cutting layout',`<p>${esc(error.message)}</p>`,missingWeight?[{label:'Enter Processed Weight',run:()=>{weight.scrollIntoView({block:'center'});weight.focus();}}]:[]);
}

function updateStripFit(){
 const summary=$('#strip-fit-summary'),button=$('#maximum-strips');if(!summary||!button)return;
 button.disabled=true;
 const suggestion=$('#cutting-layout-suggestion');if(suggestion)suggestion.replaceChildren();
 try{
  const job=cuttingForm(),coil=coilsFrom(store).get(job['Coil Reference']),width=document.querySelector('[data-line-field="Strip Size"]')?.value;
  if(!coil||!Number(width)){summary.textContent='Select a coil and enter a strip width to see the maximum strip count.';return;}
  const fit=maximumStrips(coil.width,width,0);
  summary.textContent=`For ${Number(width)} mm strips: maximum ${fit.count} across ${fit.available.toFixed(3)} mm for the next cut; unused width at maximum: ${fit.remainingWidth.toFixed(3)} mm.`;
  button.disabled=fit.count<1;
 }catch(error){summary.textContent=error.message;}
 // Suggestions are discarded at the start of each source-layout update.
}
function suggestCuttingLayout(){
 try{
  const job=cuttingForm(),coil=cuttingStock(store).coils.get(job['Coil Reference']);if(!coil)throw Error('Select a coil first');if(coil.remainingWeight<=1e-7)throw Error('This coil is already consumed. Select another coil.');
  const lines=clone(lineDraft).map(line=>{const {'Cut No':cut,'Cut Weight':weight,...rest}=line;return rest;}),pending={};document.querySelectorAll('[data-line-field]').forEach(e=>pending[e.dataset.lineField]=e.value);
  if(Number(pending['Strip Size'])>0)lines.push(pending);
  const result=optimizeLayout(coil.width,lines),container=$('#cutting-layout-suggestion');
  container.innerHTML=`<p><strong>Suggested mix for one new cut:</strong> ${result.lines.map(l=>`${esc(l.Quantity)} × ${esc(l['Strip Size'])} mm`).join(' + ')}.</p><p>${result.stripCount} strips · Unused width: ${result.remainingWidth.toFixed(3)} mm · Utilization: ${result.utilization.toFixed(2)}%</p><button class="plain-button" id="apply-cutting-layout">Submit suggested cut</button>`;
  $('#apply-cutting-layout').onclick=()=>{
   try{
    const proposal=appendCut(cuttingForm(),result.lines,$('[data-field="Processed Weight"]').value),currentCoil=cuttingStock(store).coils.get(proposal['Coil Reference']);
    const calculated=calculateCutting(proposal,currentCoil);if(calculated.processed>currentCoil.remainingWeight+1e-7)throw Error('Suggested cut exceeds available coil weight. Reduce its cut weight.');
    lineDraft=calculated.lines;renderLines(definitions[CUTTING]);bindCuttingLines();
   }catch(error){showCuttingError(error);}
  };
 }catch(error){textMessage('Unable to suggest layout',error.message);}
}
function renderCuttingSheet(job){
 try{
  const coil=coilsFrom(store).get(job['Coil Reference']),html=cuttingJobSheet(job,coil),body=createWindow('Cutting job sheet — '+job.Code);
  body.classList.add('cutting-sheet-view');body.innerHTML=`<div class="report-actions"><button class="plain-button" id="print-cutting-sheet">Print / Save PDF</button><button class="plain-button" id="back-cutting-sheet">Back to cutting job</button></div><p class="window-note">A4 portrait · Issue this posted job sheet to the labour team. Turn off browser headers and footers.</p>${html}`;
  $('#print-cutting-sheet').onclick=()=>window.print();$('#back-cutting-sheet').onclick=()=>render();status('Posted cutting job sheet · '+job.Code);
 }catch(error){textMessage('Job sheet unavailable',error.message);}
}

function lockConsumedCuttingFields(consumed){
 // Leave identity/date and coil selection available; preserve calculated fields' readonly state.
 document.querySelectorAll('[data-field]:not([data-field="Coil Reference"]):not([data-field="Code"]):not([data-field="Date"]),[data-line-field],#add-line,[data-remove-line],[data-action="Save"]').forEach(field=>{
  field.disabled=consumed||field.dataset.field==='Cutting Status';
 });
}

function grnDropdown(field){
 const item=['Item Code','Item Description'].includes(field),rows=rowsFor(item?'Item Master Setup':'Item Main Category');
 const options=rows.filter(row=>!item||row.Description?.trim()).map(row=>{
  const label=field==='Item Description'?`${row.Description} · ${row.Code}`:field==='Coil Type'?`${row.Name} · ${row.Code}`:field==='Coil Code'?`${row.Code} · ${row.Name}`:row.Code;
  return `<option value="${esc(row.Code)}">${esc(label)}</option>`;
 }).join('');
 return `<select data-line-field="${esc(field)}" aria-label="Line ${esc(field)}"><option value="">Select…</option>${options}</select>`;
}
function bindGRNDropdowns(){
 const field=name=>document.querySelector(`[data-line-field="${name}"]`);
 for(const [a,b] of [['Item Code','Item Description'],['Coil Type','Coil Code']]){
  for(const [from,to] of [[a,b],[b,a]])field(from)?.addEventListener('change',()=>{field(to).value=field(from).value;if(a==='Item Code'){const item=rowsFor('Item Master Setup').find(row=>row.Code===field(from).value);if(item&&rowsFor('Item Main Category').some(category=>category.Code===item['Main Category Code'])){field('Coil Type').value=item['Main Category Code'];field('Coil Code').value=item['Main Category Code'];}}});
 }
 const hint=document.createElement('p');hint.className='window-note grn-item-hint';hint.textContent='Items: Setup → GRN Item Setup · Coil types and codes: Setup → Item Main Category. Codes and names stay linked.';
 $('#line-items').prepend(hint);
}

function screenSection(){return Object.entries(menus).find(([,entries])=>entries.includes(current))?.[0]||'Workspace';}
function updateNavigation(){
 document.querySelectorAll('.menu').forEach(menu=>{const button=menu.firstElementChild;button.classList.toggle('active',button.textContent===(current?screenSection():'Start'));});
 document.querySelectorAll('[data-screen]').forEach(button=>{if(button.dataset.screen===current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
}
function renderDashboard(){
 let available='—',consumed='—';try{const coils=[...cuttingStock(store).coils.values()];available=coils.filter(c=>c.remainingWeight>1e-7).length;consumed=coils.filter(c=>c.remainingWeight<=1e-7).length;}catch{}
 const drafts=rowsFor(CUTTING).filter(j=>j['Cutting Status']==='Draft').length;
 desktop.innerHTML=`<section class="dashboard classic-dashboard"><div class="dashboard-heading"><h1>Inventory and Production</h1><p>Use the familiar menus above, or open a task below.</p></div><div class="dashboard-stats"><div><span>Available coils</span><strong>${available}</strong><small>With remaining stock</small></div><div><span>Consumed coils</span><strong>${consumed}</strong><small>No remaining weight</small></div><div><span>Cutting drafts</span><strong>${drafts}</strong><small>Not posted to stock</small></div></div><h2>Daily work</h2><div class="dashboard-tasks">${[['GRN (Goods Received Note)','Receive coils','Enter supplier details, receive coils and print their labels.'],[CUTTING,'Create a cutting job','Select a coil, plan strips and issue a labour job sheet.'],['Coil & Strip Stock','Review coil and strip stock','Check remaining coil weight and posted cutting outputs.'],['DC Creation','Create a delivery challan','Record the buyer, vehicle and products being dispatched.']].map(([screen,title,description],i)=>`<button class="dashboard-task" data-home-screen="${esc(screen)}"><span class="task-number">0${i+1}</span><strong>${esc(title)}</strong><span>${esc(description)}</span><span class="task-open">${esc(screen)} →</span></button>`).join('')}</div><div class="dashboard-help"><div><strong>Setup and reports are in the same place.</strong><p>Use Setup to maintain items and categories. Use Reports to review and print records.</p></div><button class="plain-button" id="home-setup">Open item setup</button></div></section>`;
 desktop.querySelectorAll('[data-home-screen]').forEach(button=>button.onclick=()=>navigate(button.dataset.homeScreen));$('#home-setup').onclick=()=>navigate('GRN Item Setup');updateNavigation();
}
