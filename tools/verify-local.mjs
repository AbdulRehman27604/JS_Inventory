// Runs only against an isolated Chrome debugging endpoint and localhost.
import fs from 'node:fs/promises';
import {definitions,menus} from '../dist/data.js';

const pages=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const base=process.env.QA_URL||'http://localhost:4173';
const page=pages.find(p=>p.type==='page'&&p.url.startsWith(base));
if(!page)throw Error('Local QA tab not found');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let sequence=0;const pending=new Map(),errors=[],requests=[],checks=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else{
 if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+' '+(m.params.exceptionDetails.exception?.description||''));
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));
 if(m.method==='Network.responseReceived')requests.push({url:m.params.response.url,status:m.params.response.status});
 if(m.method==='Network.loadingFailed'&&!m.params.canceled)errors.push(m.params.errorText);
}};
function call(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function check(name,expression){const result=await evaluate(expression);checks.push({name,passed:!!result});if(!result)throw Error('Failed: '+name);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function navigate(name){await evaluate(`document.querySelector('[data-screen='+CSS.escape(${JSON.stringify(name)})+']').click()`);await pause(60);}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(30);}
async function screenshot(name){const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL('../verification/'+name+'.png',import.meta.url),Buffer.from(r.data,'base64'));}
if(process.argv.includes('--close-only')){await call('Browser.close');ws.close();process.exit(0);}
await fs.mkdir(new URL('../verification/',import.meta.url),{recursive:true});
try{
 await call('Runtime.enable');await call('Network.enable');await call('Page.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base});await pause(700);
 const exportsDirectory=await fs.mkdtemp('/private/tmp/sst-qa-exports-');
 await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:exportsDirectory});
 await check('six application menus',`document.querySelectorAll('.menu').length===6`);
 await screenshot('desktop');
 for(const name of Object.keys(definitions)){
  await navigate(name);
  await check(name+' opens',`document.querySelector('.form-window')?.getAttribute('aria-label')===${JSON.stringify(name)}`);
  await check(name+' has correct record fields',`document.querySelectorAll('[data-field]').length===${(definitions[name].fields||['Code','Name']).length}`);
 }
 for(const name of menus.Reports){await navigate(name);await check(name+' opens',`!!document.querySelector('.report-page')`);}
 for(const name of menus['System Admin']){await navigate(name);await check(name+' limitation disclosed',`document.querySelector('.admin-message')?.textContent.includes('unavailable')`);}
 await navigate('Company Setup');await screenshot('company');
 await click('[data-action="Next"]');await check('next record',`document.querySelector('[data-field="Code"]').value==='002'`);
 await click('[data-action="Last"]');await check('last record',`document.querySelector('[data-field="Code"]').value==='010'`);
 await click('[data-action="Previous"]');await check('previous record',`document.querySelector('[data-field="Code"]').value==='009'`);
 await click('[data-action="First"]');await check('first record',`document.querySelector('[data-field="Code"]').value==='001'`);
 await click('[data-action="Search"]');
 await evaluate(`document.querySelector('#search-query').value='HASCO';document.querySelector('#search-query').dispatchEvent(new Event('input'))`);
 await check('search filters records',`document.querySelectorAll('[data-result]').length===1`);
 await click('[data-result]');await check('search selects record',`document.querySelector('[data-field="Code"]').value==='010'`);
 const baseline=await evaluate(`(async()=>{const r=await fetch('/api/data');return (await r.json()).tables})()`);
 await navigate('Export local data');await pause(350);
 const exported=JSON.parse(await fs.readFile(exportsDirectory+'/inventory-local-data.json','utf8'));
 checks.push({name:'JSON export contains all 20 collections and receiving lines',passed:Object.keys(exported.tables).length===20&&exported.tables['GRN (Goods Received Note)'][0]._lines.length===2});
 if(!checks.at(-1).passed)throw Error('JSON export failed');
 const imported=structuredClone(exported);imported.tables['Unit Setup'].push({Code:'998',Name:'JSON IMPORT QA'});
 await evaluate(`(()=>{const original=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file'){const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(imported))}],'inventory.json',{type:'application/json'}));this.files=dt.files;this.dispatchEvent(new Event('change'));HTMLInputElement.prototype.click=original;}else original.call(this);};})()`);
 await navigate('Import local data');await pause(150);await click('[data-modal-action="0"]');
 await navigate('Unit Setup');await click('[data-action="Last"]');await check('JSON import persists through SQLite',`document.querySelector('[data-field="Code"]').value==='998'`);
 await click('[data-action="Delete"]');await click('[data-modal-action="0"]');
 await navigate('Unit Setup');await click('[data-action="Add"]');
 await evaluate(`document.querySelector('[data-field="Code"]').value='999';document.querySelector('[data-field="Name"]').value='LOCAL QA UNIT'`);
 await click('[data-action="Save"]');await check('local add and save',`document.querySelector('[data-field="Name"]').value==='LOCAL QA UNIT'`);
 await call('Page.reload');await pause(600);await click('[data-action="Last"]');
 await check('local save persists after reload',`document.querySelector('[data-field="Code"]').value==='999'`);
 await click('[data-action="Edit"]');await evaluate(`document.querySelector('[data-field="Name"]').value='UNDO QA'`);await click('[data-action="Undo"]');
 await check('undo restores record',`document.querySelector('[data-field="Name"]').value==='LOCAL QA UNIT'`);
 await click('[data-action="Edit"]');await evaluate(`document.querySelector('[data-field="Name"]').value='EDITED QA'`);await click('[data-action="Save"]');
 await check('edit saves record',`document.querySelector('[data-field="Name"]').value==='EDITED QA'`);
 await click('[data-action="Delete"]');await click('[data-modal-action="0"]');await check('delete affects local SQLite database',`(async()=>{const r=await fetch('/api/data');return (await r.json()).tables['Unit Setup'].length===7})()`);
 await navigate('GRN (Goods Received Note)');await check('captured receiving lines',`document.querySelectorAll('#line-items tbody tr').length===2`);await screenshot('goods-received');
 await click('[data-action="Edit"]');await evaluate(`document.querySelector('[data-line-field="Item Code"]').value='QA';document.querySelector('[data-line-field="Weight"]').value='12'`);await click('#add-line');await click('[data-action="Save"]');
 await check('local transaction line saves',`document.querySelectorAll('#line-items tbody tr').length===3`);
 await navigate('Coil Receiving Report');await check('report contains transaction lines',`document.querySelectorAll('#report-data tbody tr').length===3`);
 await click('#csv-report');await pause(350);
 const csv=await fs.readFile(exportsDirectory+'/Coil-Receiving-Report.csv','utf8');
 checks.push({name:'CSV export includes captured line weights and local test line',passed:csv.includes('4142')&&csv.includes('4162')&&csv.includes('QA')});
 if(!checks.at(-1).passed)throw Error('CSV export failed');
 await evaluate(`document.querySelector('#from-date').value='2023-01-01'`);await click('#preview-report');await check('report date filter',`document.querySelector('#report-data').textContent.includes('No captured')`);
 await evaluate(`(async()=>{const current=await (await fetch('/api/data')).json();const r=await fetch('/api/data',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:current.revision,tables:${JSON.stringify(baseline)}})});if(!r.ok)throw Error('Restore failed');})()`);
 await call('Page.reload');await pause(500);
 await navigate('Cutting Creation');await screenshot('cutting');
 await navigate('Item Master Setup');await screenshot('item-master');
 await navigate('Goods Received Report');await screenshot('report');
 await check('supplier and pipe report filters available',`document.querySelectorAll('[data-report-filter]').length===3`);
 await evaluate(`document.querySelector('#report-summary').value='pipe'`);await click('#preview-report');await check('summary groups captured lines',`document.querySelector('#report-data').textContent.includes('REHRC PIPE')`);
 await navigate('Captured screens');
 const references=await evaluate(`Array.from(document.querySelectorAll('.capture-list a')).map(a=>a.href)`);
 for(const url of references){const response=await fetch(url);if(response.status!==200)throw Error('Missing reference screenshot');}
 checks.push({name:'All captured-screen links load locally',passed:references.length===20});
 await click('[data-close]');
 for(const size of [{width:390,height:844},{width:768,height:1024}]){
  await call('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:true});
  await navigate('Company Setup');await check(`responsive viewport ${size.width}`,`document.querySelector('.form-window').getBoundingClientRect().right<=innerWidth+1`);
  await screenshot('mobile-'+size.width);
 }
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate('Dashboard');
 const live=await (await fetch(base+'/api/data')).json();
 const conflict=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({revision:live.revision-1,tables:live.tables})});
 checks.push({name:'Stale revisions cannot overwrite database',passed:conflict.status===409});
 const forbidden=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json',Origin:'https://example.invalid'},body:'{}'});
 checks.push({name:'Cross-origin database writes rejected',passed:forbidden.status===403});
 const invalid=await fetch(base+'/api/data',{method:'PUT',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({revision:live.revision,tables:{}})});
 checks.push({name:'Invalid database payload rejected',passed:invalid.status===400});
 if(checks.some(c=>!c.passed))throw Error('One or more checks failed');
 if(errors.length)throw Error('Browser errors: '+errors.join('\n'));
 if(requests.some(r=>r.status>=400))throw Error('Failed local request');
 if(requests.some(r=>!r.url.startsWith(base+'/')&&!r.url.startsWith('data:')))throw Error('Unexpected external dependency');
 checks.push({name:'No browser console errors, failed requests, or external requests',passed:true});
 await fs.writeFile(new URL('../verification/results.json',import.meta.url),JSON.stringify({checks,errors,requests},null,2));
 console.log(JSON.stringify({passed:checks.length,errors:errors.length,requests:requests.length}));
}finally{ws.close();}
