// Shared by the browser and server. Widths are mm; all tracked weights are kg.
export const CUTTING='Cutting Creation', RECEIVING='GRN (Goods Received Note)';
const number=(value,label,zero=false)=>{
 const n=Number(value);if(String(value??'').trim()===''||!Number.isFinite(n)||(zero?n<0:n<=0))throw Error(`${label} must be ${zero?'zero or positive':'positive'}`);return n;
};
export function coilsFrom(tables){
 const coils=new Map();
 for(const receipt of tables[RECEIVING]||[])for(const line of receipt._lines||[]){
 const identity=line['Coil ID']||line['Manuf Code'];
 if(!identity||!line.Width)continue;
 if(String(line.UOM).toUpperCase()!=='KG')throw Error('Tracked coils must use KG');
 const reference=encodeURIComponent(receipt.Code)+'/'+encodeURIComponent(identity);
 if(coils.has(reference))throw Error(`Duplicate coil identity in receipt ${receipt.Code}`);
 coils.set(reference,{reference,label:`${receipt.Code} · ${identity} · ${line['Item Description']||''}`,width:number(line.Width,'Coil width'),weight:number(line.Weight,'Coil weight'),line,receipt});
 }return coils;
}
function calculateLayout(job,coil){
 if(!coil)throw Error('Select a received coil with width and weight recorded');
 const weight=job['Processed Weight'];
 if(!String(weight??'').trim()||!Number.isFinite(Number(weight))||Number(weight)<=0)throw Error('Enter Processed Weight in kg greater than 0 (for example, 1000). This is the amount of coil material you are cutting in this job.');
 const processed=Number(weight);
 if(!(job._lines||[]).length)throw Error('Add at least one strip line');
 let usedWidth=0;
 const lines=job._lines.map(line=>{
 const width=number(line['Strip Size'],'Strip size'),quantity=number(line.Quantity,'Number of strips');
 if(!Number.isSafeInteger(quantity))throw Error('Number of strips must be a whole number');
 const totalWidth=width*quantity,weight=processed*(totalWidth/coil.width);usedWidth+=totalWidth;
 return {...line,'Total Width':String(totalWidth),Weight:String(weight)};
 });
 if(usedWidth>coil.width+1e-7)throw Error(`Strip layout exceeds coil width by ${(usedWidth-coil.width).toFixed(3)} mm`);
 const remainingWidth=Math.max(0,coil.width-usedWidth),trimWeight=processed*(remainingWidth/coil.width);
 if(!['Scrap','Reusable'].includes(job['Trim Disposition']))throw Error('Choose whether unused width is scrap or reusable');
 return {processed,usedWidth,remainingWidth,utilization:usedWidth/coil.width*100,outputWeight:processed-trimWeight,trimWeight,lines};
}
export function hasCutWeights(lines){return (lines||[]).some(line=>String(line['Cut No']??'').trim()!==''||String(line['Cut Weight']??'').trim()!=='');}
// Cut groups let several widths share one physical pass while separate submissions consume separate weights.
export function calculateCutting(job,coil){
 const tagged=hasCutWeights(job._lines);
 if(!tagged){const result=calculateLayout(job,coil);return {...result,separateCuts:false,cuts:[{number:1,...result}]};}
 if(!coil)throw Error('Select a received coil with width and weight recorded');
 const groups=new Map();
 for(const line of job._lines){
  const no=number(line['Cut No'],'Cut number'),weight=number(line['Cut Weight'],'Cut weight');
  if(!Number.isSafeInteger(no))throw Error('Cut number must be a whole number');
  if(!groups.has(no))groups.set(no,{weight,lines:[]});
  const group=groups.get(no);if(group.weight!==weight)throw Error('Lines in one cut must share the same cut weight');group.lines.push(line);
 }
 const cuts=[...groups].map(([no,group])=>({number:no,...calculateLayout({...job,'Processed Weight':String(group.weight),_lines:group.lines},coil)}));
 const processed=cuts.reduce((sum,cut)=>sum+cut.processed,0),outputWeight=cuts.reduce((sum,cut)=>sum+cut.outputWeight,0),trimWeight=cuts.reduce((sum,cut)=>sum+cut.trimWeight,0);
 if(!Number.isFinite(processed)||!Number.isFinite(outputWeight)||!Number.isFinite(trimWeight))throw Error('Cut totals exceed supported range');
 return {processed,outputWeight,trimWeight,utilization:outputWeight/processed*100,usedWidth:cuts.length===1?cuts[0].usedWidth:null,remainingWidth:cuts.length===1?cuts[0].remainingWidth:null,lines:cuts.flatMap(c=>c.lines),cuts,separateCuts:true};
}
export function snapshotCuts(lines,legacyWeight){
 if(!lines.length)return [];
 if(hasCutWeights(lines))return structuredClone(lines);
 const weight=number(legacyWeight,'Existing layout weight');
 return lines.map(line=>({...line,'Cut No':'1','Cut Weight':String(weight)}));
}
export function appendCut(job,newLines,weight){
 if(!String(weight??'').trim()||!Number.isFinite(Number(weight))||Number(weight)<=0)throw Error('Enter Processed Weight in kg greater than 0 (for example, 1000). This is the weight for the next cut.');
 const input=Number(weight);
 if(!Array.isArray(newLines)||!newLines.length)throw Error('Add at least one strip line');
 const previous=snapshotCuts(job._lines||[],job['Processed Weight']);
 const next=Math.max(0,...previous.map(line=>Number(line['Cut No'])))+1;
 return {...job,_lines:[...previous,...newLines.map(line=>({...line,'Cut No':String(next),'Cut Weight':String(input)}))]};
}
export function cuttingStock(tables){
 const coils=coilsFrom(tables),outputs=[];
 for(const coil of coils.values()){coil.remainingWeight=coil.weight;coil.processedWeight=0;}
 for(const job of tables[CUTTING]||[]){
 if(!['Draft','Posted','Void','',undefined].includes(job['Cutting Status']))throw Error('Invalid cutting status');
 if(job['Cutting Status']!=='Posted')continue;
 const coil=coils.get(job['Coil Reference']),result=calculateCutting(job,coil);
 if(coil.remainingWeight<=1e-7)throw Error(`Coil ${coil.label} is already consumed. Select another coil.`);
 coil.remainingWeight-=result.processed;coil.processedWeight+=result.processed;
 if(coil.remainingWeight < -1e-7)throw Error(`Coil ${coil.label} has insufficient remaining weight`);
 for(const [i,line] of result.lines.entries())outputs.push({cut:Number(line['Cut No']||1),job:job.Code,coil:coil.reference,type:'Strip',line:i+1,width:Number(line['Strip Size']),quantity:Number(line.Quantity),weight:Number(line.Weight),pipe:line['Pipe Description']||line['Pipe Code']||''});
 for(const cut of result.cuts)if(cut.trimWeight>1e-7)outputs.push({cut:cut.number,job:job.Code,coil:coil.reference,type:job['Trim Disposition']==='Reusable'?'Reusable remnant':'Scrap',width:cut.remainingWidth,quantity:1,weight:cut.trimWeight});
 }
 return {coils,outputs};
}
export function validateCuttingChanges(tables,previous){
 const next=new Map((tables[CUTTING]||[]).map(j=>[j.Code,j]));
 for(const old of previous[CUTTING]||[]){
 if(!['Posted','Void'].includes(old['Cutting Status']))continue;
 const job=next.get(old.Code);if(!job)throw Error('Posted or void cutting jobs cannot be deleted');
 const omit=j=>{const {'Cutting Status':status,_origin,...rest}=j;return rest;};
 if(JSON.stringify(omit(old))!==JSON.stringify(omit(job)))throw Error('Posted cutting jobs are locked. Void the job and create a replacement');
 if(old['Cutting Status']==='Void'&&job['Cutting Status']!=='Void')throw Error('Void cutting jobs cannot be reposted');
 if(old['Cutting Status']==='Posted'&&!['Posted','Void'].includes(job['Cutting Status']))throw Error('Posted cutting jobs can only be voided');
 }
 // Receipts used by posted jobs cannot be silently changed, including their original dimensions.
 const before=coilsFrom(previous),after=coilsFrom(tables);
 for(const job of previous[CUTTING]||[]){
 if(job['Cutting Status']!=='Posted')continue;
 const a=before.get(job['Coil Reference']),b=after.get(job['Coil Reference']);
 if(!a||!b||JSON.stringify(a.line)!==JSON.stringify(b.line))throw Error('Void the cutting jobs before changing a consumed coil receipt');
 }
 // Persist authoritative totals and estimates, independent of the browser's next-cut input.
 for(const job of tables[CUTTING]||[]){
  if(job['Cutting Status']==='Void'||!hasCutWeights(job._lines))continue;
  const result=calculateCutting(job,after.get(job['Coil Reference']));job['Processed Weight']=String(result.processed);job._lines=result.lines;
 }
 return cuttingStock(tables);
}

export function maximumStrips(coilWidth,stripWidth,allocatedWidth=0){
 const coil=number(coilWidth,'Coil width'),width=number(stripWidth,'Strip width'),allocated=number(allocatedWidth,'Allocated width',true);
 const available=Math.max(0,coil-allocated),count=Math.max(0,Math.floor((available+1e-7)/width));
 if(!Number.isSafeInteger(count))throw Error('Strip count exceeds supported range');
 return {count,available,usedWidth:count*width,remainingWidth:Math.max(0,available-count*width)};
}
// Minimize unused width, then maximize strip count. Keep at least one strip of each selected line.
export function optimizeLayout(coilWidth,selectedLines){
 const coil=number(coilWidth,'Coil width');
 if(!Array.isArray(selectedLines)||!selectedLines.length)throw Error('Select or enter at least one strip width');
 if(selectedLines.length>24)throw Error('Optimize up to 24 selected strip lines at a time');
 const widths=selectedLines.map(l=>number(l['Strip Size'],'Strip width'));
 if(widths.some(w=>w>coil))throw Error('A selected strip is wider than the coil');
 // Work in exact integer width units, supporting up to three decimal places in mm.
 const values=[coil,...widths];
 const precision=values.reduce((p,n)=>{for(let d=0;d<=3;d++)if(Math.abs(n*10**d-Math.round(n*10**d))<1e-7)return Math.max(p,d);throw Error('Layout suggestions support widths with up to 3 decimal places in mm');},0);
 const scale=10**precision,capacity=Math.round(coil*scale),units=widths.map(w=>Math.round(w*scale));
 const base=units.reduce((sum,w)=>sum+w,0),room=capacity-base;
 if(room<0)throw Error('One strip of each selected width will not fit. Remove a width from this mix');
 const gcd=(a,b)=>b?gcd(b,a%b):a,divisor=units.reduce(gcd),steps=units.map(w=>w/divisor),limit=Math.floor(room/divisor);
 if(limit>2000000)throw Error('This layout exceeds the optimizer range. Use fewer decimal places');
 const counts=new Int32Array(limit+1).fill(-1),parent=new Int16Array(limit+1).fill(-1);counts[0]=0;
 let best=0;
 for(let used=0;used<=limit;used++){
  if(counts[used]<0)continue;best=used;
  for(let i=0;i<steps.length;i++){const next=used+steps[i];if(next<=limit&&counts[next]<counts[used]+1){counts[next]=counts[used]+1;parent[next]=i;}}
 }
 const quantities=units.map(()=>1);let cursor=best;
 while(cursor>0){const i=parent[cursor];if(i<0)throw Error('Unable to reconstruct layout');quantities[i]++;cursor-=steps[i];}
 const lines=selectedLines.map((line,i)=>({...line,Quantity:String(quantities[i])})),usedWidth=(base+best*divisor)/scale;
 return {lines,usedWidth,remainingWidth:Math.max(0,coil-usedWidth),stripCount:quantities.reduce((a,b)=>a+b,0),utilization:usedWidth/coil*100};
}
