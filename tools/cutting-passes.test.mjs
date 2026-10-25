import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {appendCut,calculateCutting,cuttingStock,CUTTING,RECEIVING} from '../dist/cutting.js';
import {cuttingJobSheet} from '../dist/cutting-job-sheet.js';
const coil={width:1200,weight:5000,line:{'Coil ID':'C-001-00001-2026'},receipt:{Code:'R1'}};
const line=(width=230,quantity=5)=>({'Strip Size':String(width),Quantity:String(quantity)});
const job=()=>({Code:'J1',Date:'2026-10-25','Coil Reference':'R1/C-001-00001-2026','Cutting Status':'Draft','Trim Disposition':'Scrap',_lines:[]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('5000 kg minus two separate 2000 kg cuts leaves 1000 kg and changing next input preserves earlier weights',()=>{
 let draft=appendCut(job(),[line()],2000);near(calculateCutting(draft,coil).processed,2000);
 draft=appendCut(draft,[line()],2000);let result=calculateCutting(draft,coil);near(result.processed,4000);near(coil.weight-result.processed,1000);assert.equal(result.cuts.length,2);assert.deepEqual(result.cuts.map(c=>c.remainingWidth),[50,50]);
 draft['Processed Weight']='500';result=calculateCutting(draft,coil);near(result.processed,4000);near(result.outputWeight+result.trimWeight,4000);assert.deepEqual(result.lines.map(l=>l['Cut Weight']),['2000','2000']);
 const third=appendCut(draft,[line(100,12)],500);near(calculateCutting(third,coil).processed,4500);assert.equal(third._lines[2]['Cut Weight'],'500');
});
test('a mixed-width cut consumes its shared input weight once and later cuts consume separately',()=>{
 let draft=appendCut(job(),[line(230,3),line(100,5)],2000);draft=appendCut(draft,[line(200,6)],500);const result=calculateCutting(draft,coil);near(result.processed,2500);assert.equal(result.cuts.length,2);assert.deepEqual(result.lines.map(l=>l['Cut No']),['1','1','2']);near(result.cuts[0].remainingWidth,10);near(result.outputWeight+result.trimWeight,2500);
 const bad=structuredClone(draft);bad._lines[1]['Cut Weight']='1000';assert.throws(()=>calculateCutting(bad,coil),/share the same cut weight/);
});
test('old shared-weight jobs remain unchanged, including older imported blank cut fields',()=>{
 const old={...job(),'Processed Weight':'2000',_lines:[line(230,3),line(100,5)]};near(calculateCutting(old,coil).processed,2000);const blanks={...old,_lines:old._lines.map(l=>({...l,'Cut No':'','Cut Weight':''}))};near(calculateCutting(blanks,coil).processed,2000);
 const extended=appendCut(old,[line(200,6)],500);near(calculateCutting(extended,coil).processed,2500);assert.deepEqual(extended._lines.map(l=>l['Cut No']),['1','1','2']);
});
test('job sheets list each cut input instead of one overwritten weight',()=>{
 let draft=appendCut(job(),[line()],2000);draft=appendCut(draft,[line()],2000);const html=cuttingJobSheet({...draft,'Cutting Status':'Posted'},coil);assert.match(html,/4000.000 kg/);assert.match(html,/Cut 1: 2000.000 kg/);assert.match(html,/Cut 2: 2000.000 kg/);assert.ok(!html.includes('null'));assert.equal((html.match(/<article/g)||[]).length,1);
});
test('SQLite persists per-cut weights, deducts the total once, rejects overcutting and restores stock on void',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cutting-passes-'));process.env.INVENTORY_DB_PATH=path.join(directory,'inventory.sqlite');
 try{
  const {readInventory,replaceInventory}=await import('../database.mjs');let {tables,revision}=readInventory();tables[RECEIVING].push({Code:'R1',Date:'2026-10-25',_lines:[{...coil.line,Width:'1200',Weight:'5000',UOM:'KG'}]});let cut=appendCut(job(),[line()],2000);cut=appendCut(cut,[line()],2000);tables[CUTTING].push(cut);revision=replaceInventory(tables,revision);
  let current=readInventory();let saved=current.tables[CUTTING].find(j=>j.Code==='J1');assert.equal(saved['Processed Weight'],'4000');near(cuttingStock(current.tables).coils.get(cut['Coil Reference']).remainingWeight,5000);
  saved['Cutting Status']='Posted';revision=replaceInventory(current.tables,revision);for(let i=0;i<2;i++)near(cuttingStock(readInventory().tables).coils.get(cut['Coil Reference']).remainingWeight,1000);
  revision=replaceInventory(readInventory().tables,revision);near(cuttingStock(readInventory().tables).coils.get(cut['Coil Reference']).remainingWeight,1000);
  const bad=readInventory().tables;bad[CUTTING].push({...appendCut({...job(),Code:'J2'},[line()],2000),'Cutting Status':'Posted'});assert.throws(()=>replaceInventory(bad,revision),/insufficient/);assert.equal(readInventory().revision,revision);
  current=readInventory();current.tables[CUTTING].find(j=>j.Code==='J1')['Cutting Status']='Void';replaceInventory(current.tables,current.revision);near(cuttingStock(readInventory().tables).coils.get(cut['Coil Reference']).remainingWeight,5000);
 }finally{delete process.env.INVENTORY_DB_PATH;await rm(directory,{recursive:true,force:true});}
});
