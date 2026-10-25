import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignCoilIDs} from '../coil-ids.mjs';
import {coilLabel} from '../dist/coil-label.js';
const receiving='GRN (Goods Received Note)';
const coil=(type='CRC',code='001')=>({'Coil Type':type,'Coil Code':code});
const allocate=(tables,counters)=>assignCoilIDs(tables,p=>counters[p]||0,(p,n)=>counters[p]=n);
test('coil type and code format with lifetime per-type sequence across years and codes',()=>{
 const counters={},tables={[receiving]:[{Code:'1',Date:'2026-10-25',_lines:[coil(),coil(),coil('HRC')]}]};allocate(tables,counters);
 assert.deepEqual(tables[receiving][0]._lines.map(l=>l['Coil ID']),['C-001-00001-2026','C-001-00002-2026','H-001-00001-2026']);
 tables[receiving].push({Code:'2',Date:'2027-01-01',_lines:[coil('CRC','2')]});allocate(tables,counters);assert.equal(tables[receiving][1]._lines[0]['Coil ID'],'C-002-00003-2027');
 // Deleting every receipt must not recycle the high-water mark.
 tables[receiving]=[{Code:'3',Date:'2027-02-01',_lines:[coil()]}];allocate(tables,counters);assert.equal(tables[receiving][0]._lines[0]['Coil ID'],'C-001-00004-2027');
});
test('existing IDs remain stable and imports advance future numbering',()=>{
 const counters={},tables={[receiving]:[{Code:'1',Date:'2026-10-25',_lines:[{...coil(),'Coil ID':'C-001-00042-2025'},coil()]}]};allocate(tables,counters);assert.equal(tables[receiving][0]._lines[1]['Coil ID'],'C-001-00043-2026');allocate(tables,counters);assert.equal(counters.C,43);
});
test('invalid code/date and duplicate identifiers or lifetime numbers are rejected',()=>{
 for(const [code,date] of [['ABC','2026-01-01'],['1000','2026-01-01'],['001',''],['001','2026-02-30']])assert.throws(()=>allocate({[receiving]:[{Date:date,_lines:[coil('CRC',code)]}]},{}));
 const duplicate={[receiving]:[{_lines:[{'Coil ID':'C-001-00001-2026'},{'Coil ID':'C-001-00001-2026'}]}]};assert.throws(()=>allocate(duplicate,{}),/Duplicate/);
 duplicate[receiving][0]._lines[1]['Coil ID']='C-002-00001-2027';assert.throws(()=>allocate(duplicate,{}),/Duplicate lifetime/);
});
test('coil label includes physical identity and receiving details and escapes user text',()=>{
 const html=coilLabel({Code:'R1',Date:'2026-10-25',Supplier:'Steel & Co'},{'Coil ID':'C-001-00002-2026','Coil Code':'001',Width:'1200',Weight:'2000',UOM:'KG','Item Description':'<script>alert(1)</script>'},1);
 assert.match(html,/C-001-00002-2026/);assert.match(html,/1200 mm/);assert.match(html,/2000 KG/);assert.match(html,/Receipt R1 · Line 2/);assert.match(html,/Steel &amp; Co/);assert.ok(!html.includes('<script>'));assert.throws(()=>coilLabel({},{}),/Coil ID/);
});

test('SQLite numbering is persistent, revision-safe and rolled back with rejected stock changes',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const directory=await mkdtemp(path.join(tmpdir(),'coil-ids-db-'));process.env.INVENTORY_DB_PATH=path.join(directory,'inventory.sqlite');
 try{
  const {readInventory,replaceInventory}=await import('../database.mjs');
  const receivedCoil=(type='CRC',code='001')=>({...coil(type,code),'Item Code':'0001'});
  let {tables,revision}=readInventory();tables['Item Main Category']=[{Code:'001',Name:'CRC',Prefix:'C'},{Code:'002',Name:'HRC',Prefix:'H'}];tables[receiving].push({Code:'AUTO',Date:'2026-10-25',_lines:[receivedCoil(),receivedCoil(),receivedCoil('HRC','002')]});revision=replaceInventory(tables,revision);
  let saved=readInventory();assert.deepEqual(saved.tables[receiving].find(r=>r.Code==='AUTO')._lines.map(l=>l['Coil ID']),['C-001-00001-2026','C-001-00002-2026','H-002-00001-2026']);
  assert.equal(replaceInventory(tables,revision-1),null);
  const rejected=structuredClone(saved.tables);rejected[receiving].push({Code:'REJECT',Date:'2026-10-25',_lines:[receivedCoil()]});rejected['Cutting Creation'].push({Code:'INVALID','Cutting Status':'Posted','Coil Reference':'missing','Processed Weight':'1','Trim Disposition':'Scrap',_lines:[{'Strip Size':'1',Quantity:'1'}]});
  assert.throws(()=>replaceInventory(rejected,revision));assert.equal(readInventory().revision,revision);
  saved.tables[receiving].push({Code:'NEXT',Date:'2027-01-01',_lines:[receivedCoil()]});revision=replaceInventory(saved.tables,revision);assert.equal(readInventory().tables[receiving].find(r=>r.Code==='NEXT')._lines[0]['Coil ID'],'C-001-00003-2027');
  const remaining=readInventory().tables;remaining[receiving]=remaining[receiving].filter(r=>!['AUTO','NEXT'].includes(r.Code));revision=replaceInventory(remaining,revision);remaining[receiving].push({Code:'AFTER-DELETE',Date:'2027-01-02',_lines:[receivedCoil()]});replaceInventory(remaining,revision);assert.equal(readInventory().tables[receiving].find(r=>r.Code==='AFTER-DELETE')._lines[0]['Coil ID'],'C-001-00004-2027');
 }finally{delete process.env.INVENTORY_DB_PATH;await rm(directory,{recursive:true,force:true});}
});
