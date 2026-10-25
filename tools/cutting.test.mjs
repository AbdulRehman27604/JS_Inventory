import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {coilsFrom,calculateCutting,cuttingStock,validateCuttingChanges,CUTTING,RECEIVING} from '../dist/cutting.js';
const fixture=()=>({[RECEIVING]:[{Code:'R1',_lines:[{'Coil ID':'C1',Width:'1200',Weight:'2000',UOM:'KG'}]}],[CUTTING]:[]});
const job=(extra={})=>({Code:'J1','Coil Reference':'R1/C1','Processed Weight':'1000','Trim Disposition':'Scrap','Cutting Status':'Draft',_lines:[{'Strip Size':'230',Quantity:'5'}],...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('width allocation and conservation of estimated weight',()=>{
 const tables=fixture(),coil=coilsFrom(tables).get('R1/C1'),result=calculateCutting(job(),coil);
 near(result.usedWidth,1150);near(result.remainingWidth,50);near(result.outputWeight,958.3333333333);near(result.trimWeight,41.6666666667);near(result.outputWeight+result.trimWeight,1000);
 const next=job({_lines:[{'Strip Size':'230',Quantity:'3'},{'Strip Size':'100',Quantity:'5'}]});near(calculateCutting(next,coil).remainingWidth,10);
});
test('drafts do not consume; posted jobs consume once; remaining coil keeps full width',()=>{
 const tables=fixture();tables[CUTTING].push(job());near(cuttingStock(tables).coils.get('R1/C1').remainingWeight,2000);
 tables[CUTTING][0]['Cutting Status']='Posted';
 for(let i=0;i<3;i++){const stock=cuttingStock(tables);near(stock.coils.get('R1/C1').remainingWeight,1000);near(stock.coils.get('R1/C1').width,1200);assert.equal(stock.outputs.length,2);}
 tables[CUTTING].push(job({Code:'J2','Processed Weight':'500','Cutting Status':'Posted','Trim Disposition':'Reusable'}));
 const stock=cuttingStock(tables);near(stock.coils.get('R1/C1').remainingWeight,500);assert.equal(stock.outputs.at(-1).type,'Reusable remnant');
});
test('invalid layout, nonfinite values, fractional count and overconsumption are rejected',()=>{
 const tables=fixture(),coil=coilsFrom(tables).get('R1/C1');
 for(const change of [{_lines:[{'Strip Size':'300',Quantity:'5'}]},{_lines:[{'Strip Size':'100',Quantity:'1.5'}]},{'Processed Weight':'Infinity'},{'Processed Weight':'-1'},{_lines:[]},{'Trim Disposition':''}])assert.throws(()=>calculateCutting(job(change),coil));
 tables[CUTTING]=[job({'Processed Weight':'2001','Cutting Status':'Posted'})];assert.throws(()=>cuttingStock(tables),/insufficient/);
 assert.throws(()=>calculateCutting(job(),undefined),/Select/);
});
test('posted jobs are immutable, void reverses stock, and consumed receipts are protected',()=>{
 const previous=fixture();previous[CUTTING]=[job({'Cutting Status':'Posted'})];
 validateCuttingChanges(structuredClone(previous),previous);
 const modified=structuredClone(previous);modified[CUTTING][0]['Processed Weight']='500';assert.throws(()=>validateCuttingChanges(modified,previous),/locked/);
 const removed=structuredClone(previous);removed[CUTTING]=[];assert.throws(()=>validateCuttingChanges(removed,previous),/deleted/);
 const receipt=structuredClone(previous);receipt[RECEIVING][0]._lines[0].Width='1500';assert.throws(()=>validateCuttingChanges(receipt,previous),/consumed/);
 const voided=structuredClone(previous);voided[CUTTING][0]['Cutting Status']='Void';const stock=validateCuttingChanges(voided,previous);near(stock.coils.get('R1/C1').remainingWeight,2000);assert.equal(stock.outputs.length,0);
 assert.throws(()=>validateCuttingChanges(previous,voided),/reposted/);
});
test('SQLite commit validates stock atomically, rejects stale saves, and persists calculated state',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cutting-db-'));process.env.INVENTORY_DB_PATH=path.join(directory,'inventory.sqlite');
 try{
 const {readInventory,replaceInventory}=await import('../database.mjs');
 let {tables,revision}=readInventory();tables[RECEIVING].push(fixture()[RECEIVING][0]);tables[CUTTING].push(job({'Cutting Status':'Posted'}));
 revision=replaceInventory(tables,revision);near(cuttingStock(readInventory().tables).coils.get('R1/C1').remainingWeight,1000);
 assert.equal(replaceInventory(tables,revision-1),null);
 const bad=structuredClone(readInventory().tables);bad[CUTTING].push(job({Code:'J2','Cutting Status':'Posted','Processed Weight':'1001'}));assert.throws(()=>replaceInventory(bad,revision),/insufficient/);assert.equal(readInventory().revision,revision);
 const restored=readInventory().tables;restored[CUTTING].find(j=>j.Code==='J1')['Cutting Status']='Void';replaceInventory(restored,revision);near(cuttingStock(readInventory().tables).coils.get('R1/C1').remainingWeight,2000);
 }finally{delete process.env.INVENTORY_DB_PATH;await rm(directory,{recursive:true,force:true});}
});

test('fully consumed coils reject another posting; voiding makes stock available again',()=>{
 const tables=fixture();tables[CUTTING]=[job({'Processed Weight':'2000','Cutting Status':'Posted'})];
 near(cuttingStock(tables).coils.get('R1/C1').remainingWeight,0);
 tables[CUTTING].push(job({Code:'J2','Processed Weight':'1','Cutting Status':'Posted'}));assert.throws(()=>cuttingStock(tables),/already consumed/);
 tables[CUTTING][0]['Cutting Status']='Void';near(cuttingStock(tables).coils.get('R1/C1').remainingWeight,1999);
});
