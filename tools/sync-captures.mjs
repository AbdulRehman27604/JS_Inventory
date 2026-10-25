// Add newly captured reference records without overwriting local edits.
import {definitions} from '../dist/data.js';
import {readInventory,replaceInventory} from '../database.mjs';
const data=await readInventory();let added=0,enriched=0;
for(const [name,d] of Object.entries(definitions)){
 const existing=new Set(data.tables[name].map(r=>r.Code));
 for(const row of d.rows){
  if(!existing.has(row.Code)){data.tables[name].push(structuredClone(row));added++;}
  else{
   const record=data.tables[name].find(r=>r.Code===row.Code);
   if(record._origin!=='local')for(const [field,value]of Object.entries(row))if(record[field]===undefined||record[field]===''){record[field]=structuredClone(value);enriched++;}
  }
 }
}
if(added||enriched)await replaceInventory(data.tables,data.revision);
console.log(JSON.stringify({capturedRecordsAdded:added,capturedFieldsAdded:enriched}));
