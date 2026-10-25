import {definitions} from './dist/schema.js';
const defaultLineFields=['Item Code','Description','Quantity','Weight'];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function cleanFields(record,fields){
 const result={};
 for(const field of fields){
  if(record[field]!==undefined&&typeof record[field]!=='string'&&typeof record[field]!=='number')throw Error('Invalid field type');
  if(record[field]!==undefined){const value=String(record[field]);if(value.length>20000)throw Error('Field too long');result[field]=value;}
 }
 return result;
}
export function validateTables(tables){
 if(!object(tables)||Object.keys(tables).length!==Object.keys(definitions).length)throw Error('Expected all inventory collections');
 const clean={};
 for(const [name,d] of Object.entries(definitions)){
  const records=tables[name];if(!Array.isArray(records)||records.length>100000)throw Error('Invalid inventory collection');
  const codes=new Set();
  clean[name]=records.map(record=>{
   if(!object(record))throw Error('Invalid inventory record');
   const result=cleanFields(record,d.fields||['Code','Name']);
   if(name==='Item Main Category'&&result.Prefix)result.Prefix=result.Prefix.trim().toUpperCase();
   if(!result.Code?.trim()||codes.has(result.Code))throw Error('Empty or duplicate record code');
   codes.add(result.Code);result._origin=record._origin==='local'?'local':'captured';
   if(d.kind==='transaction'){
    if(record._lines!==undefined&&!Array.isArray(record._lines))throw Error('Invalid line items');
    if((record._lines||[]).length>10000)throw Error('Too many line items');
    result._lines=(record._lines||[]).map(line=>{if(!object(line))throw Error('Invalid line item');return cleanFields(line,d.lineFields||defaultLineFields);});
   }
   return result;
  });
 }
 return clean;
}
