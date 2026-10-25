const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=value=>String(value??'').trim()||'Not recorded';
export function coilLabel(receipt,line,lineIndex=0){
 const identity=line['Coil ID']||line['Manuf Code'];
 if(!identity)throw Error('Enter a Coil ID or Manuf Code, then save the receipt before printing');
 const field=(name,value,unit='')=>`<div class="coil-label-field"><span>${escape(name)}</span><strong>${escape(display(value))}${String(value??'').trim()&&unit?' '+escape(unit):''}</strong></div>`;
 return `<article class="coil-label" aria-label="Coil label ${escape(identity)}">
 <header class="coil-label-heading"><span>INVENTORY &amp; PRODUCTION</span><strong>COIL IDENTIFICATION</strong></header>
 <div class="coil-label-identity"><span>COIL ID</span><h1 class="${String(identity).length>16?'long-coil-id':''}">${escape(identity)}</h1></div>
 <div class="coil-label-description">${escape(display(line['Item Description']))}</div>
 <div class="coil-label-measurements">${field('ORIGINAL WIDTH',line.Width,'mm')}${field('RECEIVED WEIGHT',line.Weight,line.UOM||'')}</div>
 <div class="coil-label-details">${field('SUPPLIER',receipt.Supplier)}${field('DATE RECEIVED',receipt.Date)}${field('GRN / RECEIPT',receipt.Code)}${field('ITEM CODE',line['Item Code'])}${field('MANUFACTURER / COIL NO.',line['Manuf Code'])}${field('BATCH NO.',line['Batch No'])}${field('COIL CODE',line['Coil Code'])}${field('GRADE',line.Grade)}${field('COIL TYPE',line['Coil Type'])}${field('HARDNESS',line.Hardness)}${field('DELIVERY CHALLAN',receipt['DC No'])}</div>
 <footer class="coil-label-footer"><strong>Receipt ${escape(receipt.Code)} · Line ${lineIndex+1}</strong><span>Use this Coil ID in Cutting Creation. Original receiving details.</span></footer>
 </article>`;
}
