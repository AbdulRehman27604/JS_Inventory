import {categoryPrefix} from './grn-setups.mjs';
const defaults={CRC:'C',HRC:'H',GI:'G'};
export function assignCoilIDs(tables,getSequence,setSequence){
 const categories=tables['Item Main Category'];
 const prefixes=categories?Object.fromEntries(categories.map(category=>[category.Name.toUpperCase(),categoryPrefix(category)])):defaults;
 const receipts=tables['GRN (Goods Received Note)']||[],used=new Set(),serials=new Set(),highest={};
 // Include imported identifiers before allocating, regardless of receipt ordering.
 for(const receipt of receipts)for(const line of receipt._lines||[]){
  const id=line['Coil ID'];if(!id)continue;
  if(used.has(id))throw Error(`Duplicate Coil ID: ${id}`);used.add(id);
  const match=/^([A-Z])-\d{3}-(\d{5})-\d{4}$/.exec(id);
  if(match){const serial=match[1]+'-'+match[2];if(serials.has(serial))throw Error('Duplicate lifetime coil number: '+serial);serials.add(serial);highest[match[1]]=Math.max(highest[match[1]]||0,Number(match[2]));}
 }
 for(const prefix of new Set([...Object.keys(highest),...(categories?categories.map(categoryPrefix):Object.values(prefixes))]))highest[prefix]=Math.max(highest[prefix]||0,getSequence(prefix));
 for(const receipt of receipts)for(const line of receipt._lines||[]){
  if(line['Coil ID'])continue;
  const type=String(line['Coil Type']||'').trim().toUpperCase();
  const code=String(line['Coil Code']||'').trim();
  const category=categories?.find(c=>c.Code===code.padStart(3,'0')&&c.Name.toUpperCase()===type);
  const prefix=categories?(category&&categoryPrefix(category)):prefixes[type];
  // Preserve historical receipts with incomplete or nonstandard material types.
  if(!prefix)continue;
  if(!/^\d{1,3}$/.test(code))throw Error('Enter a 1–3 digit Coil Code from Item Main Category before saving this coil');
  const date=String(receipt.Date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Enter a valid receipt date before assigning coil IDs');
  const sequence=++highest[prefix];if(sequence>99999)throw Error(`Coil numbering capacity reached for ${type}`);
  line['Coil Code']=code.padStart(3,'0');line['Coil Type']=categories?.find(c=>c.Code===line['Coil Code'])?.Name||type;
  line['Coil ID']=`${prefix}-${line['Coil Code']}-${String(sequence).padStart(5,'0')}-${date.slice(0,4)}`;
 }
 // Persist a high-water mark, so deleted receipts never free numbers for reuse.
 for(const [prefix,value] of Object.entries(highest))setSequence(prefix,value);
}
