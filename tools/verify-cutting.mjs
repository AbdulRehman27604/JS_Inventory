// Isolated end-to-end browser check. Requires a local Google Chrome installation.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {menus,definitions} from '../dist/data.js';
const directory=await mkdtemp(path.join(tmpdir(),'cutting-browser-'));
process.env.INVENTORY_DB_PATH=path.join(directory,'inventory.sqlite');
const {setUser}=await import('../auth.mjs');await setUser('qa-admin','browser-test-password');
const {readInventory,replaceInventory}=await import('../database.mjs');
const snapshot=readInventory();snapshot.tables['GRN (Goods Received Note)'].push({Code:'QA-RECEIPT',Date:'2026-10-25',_lines:[{'Coil ID':'QA-COIL',Width:'1200',Weight:'2000',UOM:'KG','Item Description':'QA coil'}]});snapshot.tables['GRN (Goods Received Note)'].push({Code:'QA-EMPTY',Date:'2026-10-25',_lines:[{'Coil ID':'QA-CONSUMED',Width:'1200',Weight:'2000',UOM:'KG'}]});snapshot.tables['Cutting Creation'].push({Code:'QA-CONSUMER','Coil Reference':'QA-EMPTY/QA-CONSUMED','Processed Weight':'2000','Trim Disposition':'Scrap','Cutting Status':'Posted',_lines:[{'Strip Size':'230',Quantity:'5'}]});replaceInventory(snapshot.tables,snapshot.revision);
const port=String(25000+Math.floor(Math.random()*5000)),debug=String(30000+Math.floor(Math.random()*5000)),base=`http://localhost:${port}`;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe']});
let chrome,ws;const errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server failed');})]);
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(directory,'chrome')}`,'about:blank'],{stdio:'ignore'});
 let pages;for(let i=0;i<100;i++){try{pages=await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();if(pages.length)break;}catch{}await pause(100);}
 assert.ok(pages?.length,'Chrome debugging started');
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(ws,'open');
 let id=0;const pending=new Map();ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const current=++id;pending.set(current,{resolve,reject});ws.send(JSON.stringify({id:current,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(75);}throw Error('Timed out: '+expression);};
 const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(80);};
 const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const capture=async name=>{await mkdir('verification',{recursive:true});const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile('verification/'+name+'.png',Buffer.from(shot.data,'base64'));};
 await call('Runtime.enable');await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/login'});await until("!!document.querySelector('#login')");
 if(await evaluate("document.documentElement.dataset.theme==='dark'"))await click('[data-theme-toggle]');await click('[data-theme-toggle]');assert.equal(await evaluate("localStorage.getItem('inventory-color-mode')"),'dark');await capture('classic-login-dark');
 const themeTime=await evaluate('performance.timeOrigin');await call('Page.reload');await until(`performance.timeOrigin!==${themeTime}`);await until("!!document.querySelector('#login')");assert.equal(await evaluate("document.documentElement.dataset.theme"),'dark');
 await fill('#username','qa-admin');await fill('#password','browser-test-password');await click('button[type=submit]');await until("!!document.querySelector('[data-screen=\"Cutting Creation\"]')");
 assert.equal(await evaluate("document.documentElement.dataset.theme"),'dark');await until("!!document.querySelector('#live-clock')?.dateTime");await capture('classic-dashboard-dark');const clockBefore=await evaluate("document.querySelector('#live-clock').dateTime");await pause(1200);assert.notEqual(await evaluate("document.querySelector('#live-clock').dateTime"),clockBefore);assert.equal(await evaluate("document.querySelector('[data-live-date]').textContent"),await evaluate("new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date())"));await click('[data-theme-toggle]');assert.equal(await evaluate("document.documentElement.dataset.theme"),'light');
 assert.equal(await evaluate("document.querySelectorAll('.dashboard-task').length"),4);assert.equal(await evaluate(`!!document.querySelector('link[href="/classic-appearance.css"]')`),true);assert.equal(await evaluate(`!!document.querySelector('link[href="/theme.css"]')`),false);await capture('classic-dashboard');
 await click('[data-home-screen="GRN (Goods Received Note)"]');assert.match(await evaluate("document.querySelector('.screen-title').textContent"),/GRN/);await click('[data-action="Exit"]');assert.equal(await evaluate("!!document.querySelector('.dashboard')"),true);
 for(const group of ['Setup','Transactions','Reports','System Admin'])for(const screen of menus[group].filter(name=>name!=='-')){
  await click(`[data-screen="${screen}"]`);assert.equal(await evaluate("!!document.querySelector('.form-window')"),true,screen);
  const actual=screen==='GRN Item Setup'?'Item Master Setup':screen;
  if(definitions[actual]?.kind==='transaction'){
   const oldDate=await evaluate(`document.querySelector('[data-field="Date"]').value`);await click('[data-action="Add"]');assert.equal(await evaluate(`document.querySelector('[data-field="Date"]').value`),await evaluate("new Intl.DateTimeFormat('sv-SE').format(new Date())"),screen+' defaults to local today');
   assert.equal(await evaluate(`[...document.querySelectorAll('[data-field]')].filter(e=>e.dataset.field==='Date'||e.dataset.field.endsWith(' Date')).every(e=>e.type==='date')`),true);await click('[data-action="Undo"]');assert.equal(await evaluate(`document.querySelector('[data-field="Date"]').value`),oldDate,'saved date unchanged');
  }
  if(definitions[actual])assert.deepEqual(await evaluate("[...document.querySelectorAll('.toolbar [data-action]')].slice(0,12).map(e=>e.getAttribute('aria-label'))"),['First','Previous','Next','Last','Add','Edit','Delete','Undo','Save','Search','Exit','Report']);
 }
 await click('[data-screen="Company Setup"]');await fill('#setup-search','JEDDAH');assert.equal(await evaluate("document.querySelectorAll('#setup-table [data-index]').length"),1);assert.match(await evaluate("document.querySelector('#setup-table').textContent"),/JEDDAH STEEL/);await fill('#setup-search','');await capture('classic-setup');await click('[data-theme-toggle]');await capture('classic-setup-dark');await click('[data-theme-toggle]');await click('[data-min]');assert.equal(await evaluate("document.querySelector('.form-window').hidden"),true);await click('#tasks');assert.equal(await evaluate("document.querySelector('.form-window').hidden"),false);await click('[data-max]');assert.equal(await evaluate("document.querySelector('.form-window').classList.contains('maximized')"),true);await click('[data-max]');
 await click('[data-screen="Coil Receiving Report"]');await capture('classic-report');await click('[data-theme-toggle]');await capture('classic-report-dark');await click('[data-theme-toggle]');
 await click('[data-screen="GRN Item Setup"]');await click('[data-action="Add"]');await fill('[data-field="Code"]','001');await fill('[data-field="Description"]','CRC COIL 1.2 MM X 1200 MM');await click('[data-action="Save"]');await until("!document.querySelector('[data-action=\"Edit\"]').disabled");
 await click('[data-screen="Item Main Category"]');await click('[data-action="Edit"]');await fill('[data-field="Name"]','CRC COIL');await fill('[data-field="Prefix"]','C');await click('[data-action="Save"]');await until("!document.querySelector('[data-action=\"Edit\"]').disabled");
 await click('[data-screen="Cutting Creation"]');await click('[data-action="Add"]');
 await fill('#find-coil-id','QA-CONSUMED');assert.equal(await evaluate(`document.querySelector('[data-field="Processed Weight"]').disabled`),true);assert.equal(await evaluate(`document.querySelector('[data-field="Trim Disposition"]').disabled`),true);assert.equal(await evaluate(`document.querySelector('[data-line-field="Strip Size"]').disabled`),true);assert.equal(await evaluate(`document.querySelector('[data-line-field="Quantity"]').disabled`),true);assert.equal(await evaluate(`document.querySelector('[data-action="Save"]').disabled`),true);assert.equal(await evaluate(`document.querySelector('[data-field="Coil Reference"]').disabled`),false);assert.match(await evaluate("document.querySelector('#coil-id-result').textContent"),/Already consumed/);assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/Already consumed/);assert.equal(await evaluate("document.querySelector('#add-line').disabled"),true);assert.equal(await evaluate("document.querySelector('#suggest-cutting-layout').disabled"),true);assert.match(await evaluate(`document.querySelector('[data-field="Coil Reference"] option:checked').textContent`),/Already consumed/);
 await fill('[data-field="Coil Reference"]','QA-RECEIPT/QA-COIL');assert.equal(await evaluate(`document.querySelector('[data-field="Processed Weight"]').disabled`),false);assert.equal(await evaluate(`document.querySelector('[data-line-field="Strip Size"]').disabled`),false);assert.equal(await evaluate(`document.querySelector('[data-action="Save"]').disabled`),false);assert.equal(await evaluate(`document.querySelector('[data-field="Weight"]').readOnly`),true);assert.equal(await evaluate(`document.querySelector('[data-field="Cutting Status"]').disabled`),true);assert.equal(await evaluate("document.querySelector('#add-line').disabled"),false);await fill('[data-field="Processed Weight"]','1000');
 await fill('[data-line-field="Pipe Code"]','003');assert.equal(await evaluate('document.querySelector(\'[data-line-field="Strip Size"]\').value'),'59');
 await fill('[data-field="Processed Weight"]','');await fill('[data-line-field="Quantity"]','5');await click('#add-line');assert.match(await evaluate("document.querySelector('#modal').textContent"),/Enter Processed Weight in kg/);await click('[data-modal-action="0"]');assert.equal(await evaluate('document.activeElement.dataset.field'),'Processed Weight');await fill('[data-field="Processed Weight"]','1000');
 await fill('[data-line-field="Quantity"]','21');await click('#add-line');assert.match(await evaluate("document.querySelector('#modal').textContent"),/exceeds coil width/);await click('[data-close]');
 await fill('[data-line-field="Quantity"]','5');
 assert.match(await evaluate("document.querySelector('#strip-fit-summary').textContent"),/maximum 20/);await click('#maximum-strips');assert.equal(await evaluate(`document.querySelector('[data-line-field="Quantity"]').value`),'20');await click('#suggest-cutting-layout');assert.match(await evaluate("document.querySelector('#cutting-layout-suggestion').textContent"),/20 × 59/);await click('#apply-cutting-layout');assert.equal(await evaluate(`document.querySelectorAll('[data-remove-line]').length`),1);await click('[data-remove-line="0"]');await fill('[data-line-field="Pipe Code"]','003');await fill('[data-line-field="Quantity"]','5');
 assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/905\.000 mm/);
 await click('#add-line');await click('[data-action="Save"]');await until("!document.querySelector('[data-action=\"Edit\"]').disabled");
 assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/Available coil weight: 2000\.000 kg/);
 await click('#cutting-actions button');await click('[data-modal-action="0"]');await until("!!document.querySelector('#print-cutting-sheet')");
 const sheet=await call('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});const sheetBuffer=Buffer.from(sheet.data,'base64');assert.equal((sheetBuffer.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'posted job is one printable page');await mkdir('verification',{recursive:true});await writeFile('verification/cutting-job-sheet.pdf',sheetBuffer);
 assert.match(await evaluate("document.querySelector('.cutting-job-sheet').textContent"),/QA-COIL/);await click('#back-cutting-sheet');await until("document.querySelector('#cutting-actions button')?.textContent==='Void cutting'");
 assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/Available coil weight: 1000\.000 kg/);
 assert.equal(await evaluate('document.querySelector(\'[data-action="Edit"]\').disabled'),true);
 const oldTime=await evaluate('performance.timeOrigin');await call('Page.reload');await until(`performance.timeOrigin!==${oldTime}`);await until("!!document.querySelector('[data-action=\"Last\"]')");await click('[data-action="Last"]');await until("document.querySelector('#cutting-summary')?.textContent.includes('Available coil weight: 1000.000 kg')");
 await mkdir('verification',{recursive:true});const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile('verification/cutting-calculations.png',Buffer.from(shot.data,'base64'));
 await click('[data-action="Add"]');await fill('[data-field="Coil Reference"]','QA-RECEIPT/QA-COIL');assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/Available coil weight: 1000\.000 kg/);await click('[data-action="Undo"]');
 await click('[data-screen="Coil & Strip Stock"]');assert.match(await evaluate("document.querySelector('.window-body').textContent"),/QA-COIL/);await click('[data-screen="Cutting Creation"]');await click('[data-action="Last"]');
 await click('#cutting-actions button');await click('[data-modal-action="0"]');await until("document.querySelector('[data-field=\"Cutting Status\"]')?.value==='Void'");assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/Available coil weight: 2000\.000 kg/);
 // Mixed-width optimizer changes quantities only when explicitly applied.
 await click('[data-action="Add"]');await fill('[data-field="Coil Reference"]','QA-RECEIPT/QA-COIL');await fill('[data-field="Processed Weight"]','1000');await fill('[data-line-field="Strip Size"]','230');await fill('[data-line-field="Quantity"]','1');await click('#add-line');await fill('[data-line-field="Strip Size"]','100');await fill('[data-line-field="Quantity"]','1');await click('#suggest-cutting-layout');assert.match(await evaluate("document.querySelector('#cutting-layout-suggestion').textContent"),/3 × 230 mm.*5 × 100 mm/);await click('#apply-cutting-layout');assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/Layout width remaining: 10\.000 mm/);await click('[data-action="Undo"]');
 // Create two coils through the actual receipt form, then verify numbering and print pagination.
 await click('[data-screen="GRN (Goods Received Note)"]');await click('[data-action="Add"]');
 await fill('[data-field="Date"]','2026-10-25');await fill('[data-field="Supplier"]','AISHA STEEL LTD');
 for(const field of ['Item Code','Item Description','Coil Type','Coil Code'])assert.equal(await evaluate(`document.querySelector('[data-line-field="${field}"]').tagName`),'SELECT');
 await fill('[data-line-field="Item Description"]','001');assert.equal(await evaluate(`document.querySelector('[data-line-field="Item Code"]').value`),'001');
 await fill('[data-line-field="Item Code"]','0001');assert.equal(await evaluate(`document.querySelector('[data-line-field="Item Description"]').value`),'0001');
 await fill('[data-line-field="Coil Code"]','002');assert.equal(await evaluate(`document.querySelector('[data-line-field="Coil Type"]').value`),'002');
 await fill('[data-line-field="Coil Type"]','001');assert.equal(await evaluate(`document.querySelector('[data-line-field="Coil Code"]').value`),'001');

 for(let i=0;i<2;i++){
  for(const [field,value] of Object.entries({'Item Code':'001','Item Description':'001','Coil Type':'001','Coil Code':'001',Width:'1200',Weight:'2000',UOM:'KG',Grade:'PRIME','Batch No':'TEST-BATCH'}))await fill(`[data-line-field="${field}"]`,value);
  if(i===0){
   const formBeforeTheme=await evaluate("[...document.querySelectorAll('[data-field],[data-line-field]')].map(e=>e.value)");await click('[data-theme-toggle]');assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-field],[data-line-field]')].map(e=>e.value)"),formBeforeTheme,'theme switch preserves unsaved form');await evaluate("document.querySelector('.window-body').scrollTop=0");await capture('classic-grn-dark');await click('[data-theme-toggle]');await capture('classic-grn');
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('.grn-line-editor').scrollIntoView({block:'start'})");
   assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,'mobile shell has no horizontal overflow');await capture('classic-grn-mobile');
   await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await click('#add-line');
 }
 await click('[data-action="Save"]');await until("document.querySelector('#line-items')?.textContent.includes('C-001-00002-2026')");
 await click('[data-coil-label="1"]');assert.equal(await evaluate("document.querySelector('.coil-label h1').textContent"),'C-001-00002-2026');
 await click('[data-theme-toggle]');assert.equal(await evaluate("document.documentElement.dataset.theme"),'dark');
 const pdf=await call('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
 const single=Buffer.from(pdf.data,'base64');assert.equal((single.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'one page for one coil');
 await writeFile('verification/coil-label.pdf',single);
 const labelShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('verification/coil-label.png',Buffer.from(labelShot.data,'base64'));
 await fill('#coil-label-choice','all');const all=await call('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});assert.equal((Buffer.from(all.data,'base64').toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2,'two coils print on separate pages');
 await click('#back-coil-label');await click('[data-screen="Cutting Creation"]');await click('[data-action="Add"]');await fill('#find-coil-id','C-001-00002-2026');
 assert.match(await evaluate("document.querySelector('#coil-id-result').textContent"),/Coil selected/);assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/C-001-00002-2026/);assert.match(await evaluate("document.querySelector('#cutting-summary').textContent"),/Available coil weight: 2000\.000 kg/);
 await click('[data-action="Undo"]');
 // Longer job instructions must preserve all lines on numbered continuation sheets.
 await evaluate(`(async()=>{const {cuttingJobSheet}=await import('/cutting-job-sheet.js');const coil={width:1200,line:{'Coil ID':'C-001-00002-2026','Item Description':'CRC COIL 1.2 MM X 1200 MM','Coil Type':'CRC',Grade:'PRIME','Batch No':'BATCH-001'},receipt:{Code:'R1'}};const job={Code:'J-LONG',Date:'2026-10-25','Cutting Status':'Posted','Processed Weight':'1000','Trim Disposition':'Scrap',Comments:'Cut to specified widths. Keep batches separate.',_lines:Array.from({length:13},()=>({'Strip Size':'50',Quantity:'1','Pipe Description':'CRC ROUND PIPE 19.05 MM X 1.20 MM','Pipe Code':'003','Strip Code':'001','Thick Name':'1.20 MM (18 SWG)'}))};const body=document.querySelector('.window-body');body.classList.add('cutting-sheet-view');body.innerHTML=cuttingJobSheet(job,coil);})()`);
 const long=await call('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});const longBuffer=Buffer.from(long.data,'base64');assert.equal((longBuffer.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,3,'13 lines fit on three complete numbered sheets');await writeFile('verification/cutting-job-sheet-multiple.pdf',longBuffer);
 assert.deepEqual(errors,[]);console.log('PASS: login, coil selection, pipe/strip lookup, live remaining width, draft, posting, persistence, locking, void reversal, automatic coil IDs, full-ID lookup, one-page printed coil labels, maximum strip counts, mixed-width optimization, posted labour job sheets, dashboard shortcuts, setup search, all screen navigation, mobile layout, dark-mode persistence, live date/time, and local current-date defaults; no browser exceptions.');
}finally{
 if(ws)ws.close();for(const child of [chrome,server])if(child&&child.exitCode===null){child.kill('SIGKILL');await once(child,'exit');}
 await rm(directory,{recursive:true,force:true});
}
