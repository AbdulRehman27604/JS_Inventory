import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendCut,calculateCutting,cuttingStock,CUTTING,RECEIVING} from '../dist/cutting.js';
import {reuseChoices,addReuseToCut} from '../dist/cutting-reuse.js';
const coil={width:900,weight:3000,line:{'Coil ID':'C-001-00001-2026'},receipt:{Code:'R1'}};
const pipes=[{Code:'P1',Name:'First pipe'},{Code:'P2',Name:'Second pipe'}];
const strips=[{Code:'S100',Name:'100 MM',Size:'100','Pipe Size Code':'P2','Thickness Code':'T1',Thickness:'1.2 mm'},{Code:'S60',Name:'60 MM',Size:'60','Pipe Size Code':'P2','Thickness Code':'T1',Thickness:'1.2 mm'},{Code:'S120',Name:'120 MM',Size:'120','Pipe Size Code':'P2','Thickness Code':'T1',Thickness:'1.2 mm'},{Code:'WRONG',Name:'50 MM',Size:'50','Pipe Size Code':'P2','Thickness Code':'T2',Thickness:'2 mm'}];
const base=()=>appendCut({Code:'J1','Coil Reference':'R1/C-001-00001-2026','Cutting Status':'Draft','Trim Disposition':'Scrap',_lines:[]},[{'Strip Size':'200',Quantity:'4','Pipe Code':'P1','Thick Code':'T1','Thick Name':'1.2 mm',Issue:'Y'}],1500);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('reuse dropdown only offers widths that fit, compatible thickness and configured pipes',()=>{
 const choices=reuseChoices(base(),coil,1,strips,pipes);assert.deepEqual(choices.map(c=>c.strip.Code),['S100','S60']);assert.equal(choices[0].maxCount,1);near(choices[0].remainingWidth,0);assert.deepEqual(reuseChoices(base(),coil,1,strips,[]),[]);
});
test('900 mm, 1500 kg pass: 4 x 200 plus 1 x 100 uses the same input weight once',()=>{
 const first=base(),before=calculateCutting(first,coil);near(before.remainingWidth,100);near(before.trimWeight,1500*100/900);
 const updated=addReuseToCut(first,coil,1,strips[0],pipes,1,'N'),result=calculateCutting(updated,coil);assert.equal(result.cuts.length,1);near(result.processed,1500);near(result.usedWidth,900);near(result.remainingWidth,0);near(result.outputWeight,1500);near(result.trimWeight,0);assert.deepEqual(result.lines.map(l=>l['Cut No']),['1','1']);assert.equal(result.lines[1].Issue,'N');assert.equal(first._lines.length,1,'original draft is not mutated');
 const tables={[RECEIVING]:[{Code:'R1',_lines:[{...coil.line,Width:'900',Weight:'3000',UOM:'KG'}]}],[CUTTING]:[{...updated,'Cutting Status':'Posted'}]};const stock=cuttingStock(tables);near(stock.coils.get(updated['Coil Reference']).remainingWeight,1500);assert.equal(stock.outputs.length,2);near(stock.outputs.reduce((sum,o)=>sum+o.weight,0),1500);
});
test('reject over-width quantity, wrong thickness, invalid issue values and posted/void changes',()=>{
 assert.throws(()=>addReuseToCut(base(),coil,1,strips[0],pipes,2),/between 1 and 1/);assert.throws(()=>addReuseToCut(base(),coil,1,strips[2],pipes,1),/does not fit/);assert.throws(()=>addReuseToCut(base(),coil,1,strips[3],pipes,1),/does not fit/);assert.throws(()=>addReuseToCut(base(),coil,1,strips[0],pipes,1,'maybe'),/Yes or No/);
 for(const status of ['Posted','Void'])assert.throws(()=>addReuseToCut({...base(),'Cutting Status':status},coil,1,strips[0],pipes,1),/Only draft/);
 const full=addReuseToCut(base(),coil,1,strips[0],pipes,1);assert.deepEqual(reuseChoices(full,coil,1,strips,pipes),[]);
});
test('using remaining width in one cut preserves other cuts and their input weights',()=>{
 const draft=appendCut(base(),[{'Strip Size':'300',Quantity:'3'}],500),updated=addReuseToCut(draft,coil,1,strips[0],pipes,1);const result=calculateCutting(updated,coil);near(result.processed,2000);assert.equal(result.cuts.length,2);near(result.cuts[0].processed,1500);near(result.cuts[1].processed,500);near(result.cuts[0].remainingWidth,0);near(result.cuts[1].remainingWidth,0);
});
