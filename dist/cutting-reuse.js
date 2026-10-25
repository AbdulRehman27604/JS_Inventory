import {calculateCutting,snapshotCuts,maximumStrips} from './cutting.js';
const normalized=value=>String(value||'').trim().toUpperCase();
function compatible(cut,strip){
 const codes=new Set(cut.lines.map(l=>normalized(l['Thick Code'])).filter(Boolean));
 if(codes.size>1)return false;
 if(codes.size)return codes.has(normalized(strip['Thickness Code']));
 const names=new Set(cut.lines.map(l=>normalized(l['Thick Name'])).filter(Boolean));
 if(names.size>1)return false;
 return !names.size||names.has(normalized(strip.Thickness));
}
export function reuseChoices(job,coil,cutNo,strips,pipes){
 const cut=calculateCutting(job,coil).cuts.find(c=>c.number===Number(cutNo));
 if(!cut)throw Error('Cut not found');
 if(cut.remainingWidth<=1e-7)return [];
 return strips.flatMap(strip=>{
  const width=Number(strip.Size),pipe=pipes.find(p=>p.Code===strip['Pipe Size Code']);
  if(!Number.isFinite(width)||width<=0||width>cut.remainingWidth+1e-7||!pipe||!compatible(cut,strip))return [];
  const fit=maximumStrips(cut.remainingWidth,width);
  return fit.count?[{strip,pipe,width,maxCount:fit.count,remainingWidth:fit.remainingWidth}]:[];
 }).sort((a,b)=>a.remainingWidth-b.remainingWidth||b.width-a.width||String(a.strip.Code).localeCompare(String(b.strip.Code)));
}
export function addReuseToCut(job,coil,cutNo,strip,pipes,quantity,issue=''){
 if(['Posted','Void'].includes(job['Cutting Status']))throw Error('Only draft cuts can reuse remaining width');
 if(!['','Y','N'].includes(issue))throw Error('Issue must be Yes or No');
 const base={...job,_lines:snapshotCuts(job._lines||[],job['Processed Weight'])};
 const choice=reuseChoices(base,coil,cutNo,[strip],pipes)[0];
 if(!choice)throw Error('This strip does not fit the remaining width or matching thickness');
 const count=Number(quantity);if(!Number.isSafeInteger(count)||count<1||count>choice.maxCount)throw Error(`Choose between 1 and ${choice.maxCount} strips`);
 const cut=calculateCutting(base,coil).cuts.find(c=>c.number===Number(cutNo));
 const line={'Pipe Code':choice.pipe.Code,'Pipe Description':choice.pipe.Name,'Thick Code':strip['Thickness Code']||'','Thick Name':strip.Thickness||'','Strip Code':strip.Code,'Strip Name':strip.Name,'Strip Size':String(choice.width),Quantity:String(count),Issue:issue,'Lot No':cut.lines[0]['Lot No']||job['Lot No']||'','Cut No':String(cut.number),'Cut Weight':String(cut.processed)};
 const result=calculateCutting({...base,_lines:[...base._lines,line]},coil);
 return {...base,'Processed Weight':String(result.processed),_lines:result.lines};
}
