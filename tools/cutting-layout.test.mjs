import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maximumStrips,optimizeLayout} from '../dist/cutting.js';
import {cuttingJobSheet} from '../dist/cutting-job-sheet.js';
const strip=width=>({'Strip Size':String(width),Quantity:'1','Pipe Description':'CRC pipe','Thick Name':'1.2 mm'});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('maximum strip count accounts for existing allocations and decimal widths',()=>{
 assert.deepEqual(maximumStrips(1200,230),{count:5,available:1200,usedWidth:1150,remainingWidth:50});
 assert.deepEqual(maximumStrips(1200,100,690),{count:5,available:510,usedWidth:500,remainingWidth:10});
 assert.equal(maximumStrips(.3,.1).count,3);assert.equal(maximumStrips(1200,1500).count,0);
 assert.throws(()=>maximumStrips(1200,0));assert.throws(()=>maximumStrips(1200,-1));
});
test('mixed optimization minimizes waste while retaining every selected width',()=>{
 const result=optimizeLayout(1200,[strip(230),strip(100)]);
 assert.deepEqual(result.lines.map(l=>Number(l.Quantity)),[3,5]);near(result.usedWidth,1190);near(result.remainingWidth,10);assert.equal(result.stripCount,8);
 const single=optimizeLayout(1200,[strip(230)]);assert.equal(single.lines[0].Quantity,'5');near(single.remainingWidth,50);
 const decimal=optimizeLayout(1219,[strip(149.3),strip(99),strip(69)]);assert.ok(decimal.remainingWidth>=0);assert.ok(decimal.lines.every(l=>Number(l.Quantity)>=1));
 assert.equal(optimizeLayout(.3,[strip(.1)]).lines[0].Quantity,'3');
});
test('on equal waste, prefer more strips; quantities are suggestions and input stays intact',()=>{
 const input=[strip(200),strip(100)],copy=structuredClone(input),result=optimizeLayout(1200,input);assert.deepEqual(result.lines.map(l=>Number(l.Quantity)),[1,10]);near(result.remainingWidth,0);assert.deepEqual(input,copy);
});
test('optimizer matches exhaustive search for small widths',()=>{
 for(let capacity=8;capacity<=40;capacity++)for(let a=2;a<8;a++)for(let b=2;b<8;b++){
  if(a+b>capacity)continue;
  let best=-1,count=-1;for(let x=1;x*a<=capacity;x++)for(let y=1;x*a+y*b<=capacity;y++){const used=x*a+y*b;if(used>best||(used===best&&x+y>count)){best=used;count=x+y;}}
  const result=optimizeLayout(capacity,[strip(a),strip(b)]);near(result.usedWidth,best);assert.equal(result.stripCount,count);
 }
});
test('reject unsupported or impossible layouts without approximating',()=>{
 for(const [capacity,lines] of [[1200,[]],[1200,[strip(0)]],[1200,[strip(1500)]],[1200,[strip(800),strip(500)]],[1200,[strip(.12345)]]])assert.throws(()=>optimizeLayout(capacity,lines));
});
test('only posted jobs produce sheets, with true instructions, totals, escaped text and continuation pages',()=>{
 const coil={width:1200,line:{'Coil ID':'C-001-00002-2026','Item Description':'CRC COIL','Coil Type':'CRC'},receipt:{Code:'R1'}};
 const job={Code:'J1',Date:'2026-10-25','Cutting Status':'Posted','Processed Weight':'1000','Trim Disposition':'Scrap',Comments:'<script>bad</script>',_lines:[{...strip(230),Quantity:'5'}]};
 const html=cuttingJobSheet(job,coil);assert.match(html,/C-001-00002-2026/);assert.match(html,/1000.000 kg/);assert.match(html,/50.000 mm/);assert.match(html,/958.333 kg/);assert.match(html,/41.667 kg/);assert.ok(!html.includes('<script>'));assert.match(html,/Operator/);assert.equal((html.match(/<article/g)||[]).length,1);
 assert.throws(()=>cuttingJobSheet({...job,'Cutting Status':'Draft'},coil),/Post/);assert.throws(()=>cuttingJobSheet({...job,'Cutting Status':'Void'},coil),/Post/);
 const many={...job,_lines:Array.from({length:13},()=>strip(50))};const pages=cuttingJobSheet(many,coil);assert.equal((pages.match(/<article/g)||[]).length,3);assert.match(pages,/Page 3 of 3/);
});
