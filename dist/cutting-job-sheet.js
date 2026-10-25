import {calculateCutting} from './cutting.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=value=>String(value??'').trim()||'—';
const n=value=>Number(value).toFixed(3);
export function cuttingJobSheet(job,coil){
 if(job['Cutting Status']!=='Posted')throw Error('Post the cutting job before issuing a labour job sheet');
 const result=calculateCutting(job,coil),pageSize=result.separateCuts?4:6,pages=Math.ceil(result.lines.length/pageSize);
 const field=(label,value)=>`<div><span>${esc(label)}</span><strong>${esc(show(value))}</strong></div>`;
 return Array.from({length:pages},(_,page)=>{
 const lines=result.lines.slice(page*pageSize,(page+1)*pageSize);
 return `<article class="cutting-job-sheet" aria-label="Cutting job ${esc(job.Code)} page ${page+1}">
 <header class="job-sheet-header"><div><span>INVENTORY &amp; PRODUCTION</span><h1>CUTTING JOB SHEET</h1></div><div><span>JOB NO.</span><strong>${esc(job.Code)}</strong></div></header>
 <div class="job-sheet-coil"><span>COIL ID — CHECK BEFORE CUTTING</span><strong>${esc(coil.line['Coil ID']||coil.line['Manuf Code'])}</strong><p>${esc(show(coil.line['Item Description']))}</p></div>
 <div class="job-sheet-details">${field('JOB DATE',job.Date)}${field('RECEIPT',coil.receipt.Code)}${field('BATCH / LOT',coil.line['Batch No']||job['Lot No'])}${field('GRADE / TYPE',[coil.line.Grade,coil.line['Coil Type']].filter(Boolean).join(' / '))}</div>
 <div class="job-sheet-totals">${field('COIL WIDTH',n(coil.width)+' mm')}${field('WEIGHT TO PROCESS',n(result.processed)+' kg')}${field('STRIPS TO CUT',result.lines.reduce((s,l)=>s+Number(l.Quantity),0))}${field('UNUSED WIDTH',result.cuts.length===1?n(result.remainingWidth)+' mm':'See each cut below')}</div>
 <h2>Cutting instructions <small>Page ${page+1} of ${pages}</small></h2>
 <table class="job-sheet-lines"><thead><tr><th>${result.separateCuts?'Cut':'#'}</th><th>Pipe / strip</th><th>Thickness</th><th>Strip width<br>mm</th><th>Strips</th><th>Total width<br>mm</th><th>Est. weight<br>kg</th></tr></thead><tbody>${lines.map((line,i)=>`<tr><td>${result.separateCuts?esc(line['Cut No']):page*pageSize+i+1}</td><td>${esc(show(line['Pipe Description']||line['Strip Name']||line['Pipe Code']))}<small>${esc([line['Pipe Code'],line['Strip Code']].filter(Boolean).join(' / '))}${result.separateCuts?' · Cut input '+n(line['Cut Weight'])+' kg':''}</small></td><td>${esc(show(line['Thick Name']||line['Thick Code']))}</td><td>${n(line['Strip Size'])}</td><td><strong>${esc(line.Quantity)}</strong></td><td>${n(line['Total Width'])}</td><td>${n(line.Weight)}</td></tr>`).join('')}</tbody></table>
 <div class="job-sheet-summary"><strong>Full job totals</strong><span>${result.cuts.length===1?'Used width: '+n(result.usedWidth)+' mm':result.cuts.length+' separate cuts'} · Utilization: ${result.utilization.toFixed(2)}%</span><span>Estimated strip output: ${n(result.outputWeight)} kg · ${esc(job['Trim Disposition'])}: ${n(result.trimWeight)} kg</span></div>
 <div class="job-sheet-notes">${result.separateCuts?`<p><strong>Cut inputs on this page:</strong> ${result.cuts.filter(c=>lines.some(line=>Number(line['Cut No'])===c.number)).map(c=>`Cut ${c.number}: ${n(c.processed)} kg; unused width ${n(c.remainingWidth)} mm`).join(' · ')}. Rows with the same Cut number share that input weight.</p>`:''}<strong>Instructions / comments</strong><p>${esc(show(job.Comments))}</p><p>Widths are mm; weights are kg. Strip count means parallel strips across the coil. Unused width is ${job['Trim Disposition']==='Reusable'?'a reusable remnant: retain and identify it.':'scrap: collect and weigh it.'} Estimated weights assume equal thickness and processed length. Verify machine allowances before cutting.</p></div>
 <div class="job-sheet-actuals"><span>Actual good output: __________ kg</span><span>Actual scrap / remnant: __________ kg</span><span>Operator: ____________________</span><span>Supervisor: __________________</span><span>Start: _______________________</span><span>Finish: ______________________</span></div>
 <footer class="job-sheet-footer"><strong>POSTED · Job ${esc(job.Code)} · ${esc(coil.line['Coil ID']||coil.line['Manuf Code'])}</strong><span>Page ${page+1}/${pages} · Check job status in the application before use. Do not use a voided job.</span></footer>
 </article>`;
 }).join('');
}
