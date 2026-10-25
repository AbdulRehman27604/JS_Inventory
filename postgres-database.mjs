import {pool,transaction} from './postgres-store.mjs';
import {definitions} from './dist/schema.js';
import {validateTables} from './inventory-validation.mjs';
import {validateGRNSetups} from './grn-setups.mjs';
import {assignCoilIDs} from './coil-ids.mjs';
import {validateCuttingChanges} from './dist/cutting.js';
export async function writeTables(client,tables){
 await client.query('DELETE FROM line_items');await client.query('DELETE FROM records');
 for(const [name,records] of Object.entries(tables)){
  await client.query('INSERT INTO collections(name) VALUES($1) ON CONFLICT DO NOTHING',[name]);
  for(const [position,record] of records.entries()){
   const {_origin,_lines,...fields}=record;
   await client.query('INSERT INTO records(collection,code,position,origin,fields) VALUES($1,$2,$3,$4,$5)',[name,record.Code,position,_origin||'local',JSON.stringify(fields)]);
   for(const [i,line] of (_lines||[]).entries())await client.query('INSERT INTO line_items(collection,record_code,position,fields) VALUES($1,$2,$3,$4)',[name,record.Code,i,JSON.stringify(line)]);
  }
 }
}
export async function readWithClient(client){
 const metadata=await client.query("SELECT value FROM metadata WHERE key='revision'");
 const tables=Object.fromEntries(Object.keys(definitions).map(name=>[name,[]]));
 const {rows:lines}=await client.query('SELECT * FROM line_items ORDER BY collection,record_code,position');
 const byRecord=new Map();for(const line of lines){const key=JSON.stringify([line.collection,line.record_code]);if(!byRecord.has(key))byRecord.set(key,[]);byRecord.get(key).push(line.fields);}
 const {rows}=await client.query('SELECT * FROM records ORDER BY collection,position');
 for(const row of rows){if(!definitions[row.collection])throw Error('Unknown database collection');const record={...row.fields,_origin:row.origin};if(definitions[row.collection].kind==='transaction')record._lines=byRecord.get(JSON.stringify([row.collection,row.code]))||[];tables[row.collection].push(record);}
 return {revision:Number(metadata.rows[0]?.value||1),tables};
}
// A fresh cloud database starts empty. Private local data is migrated explicitly, never shipped in Git.
await transaction(async client=>{
 await client.query('SELECT pg_advisory_xact_lock(72641002)');
 const existing=await client.query("SELECT 1 FROM metadata WHERE key='revision'");
 if(!existing.rowCount){for(const name of Object.keys(definitions))await client.query('INSERT INTO collections(name) VALUES($1) ON CONFLICT DO NOTHING',[name]);await client.query("INSERT INTO metadata(key,value) VALUES('revision','1')");}
});
export const readInventory=()=>transaction(readWithClient,{readOnly:true});
export async function replaceInventory(tables,expectedRevision){
 const clean=validateTables(tables);
 return transaction(async client=>{
  const {rows}=await client.query("SELECT value FROM metadata WHERE key='revision' FOR UPDATE");const revision=Number(rows[0].value);
  if(revision!==expectedRevision)return null;
  const previous=(await readWithClient(client)).tables;
  const counters=await client.query("SELECT key,value FROM metadata WHERE key LIKE 'coil-sequence-%'");
  const sequences=new Map(counters.rows.map(row=>[row.key.slice('coil-sequence-'.length),Number(row.value)]));
  validateGRNSetups(clean,previous);
  assignCoilIDs(clean,prefix=>sequences.get(prefix)||0,(prefix,value)=>sequences.set(prefix,value));
  validateCuttingChanges(clean,previous);
  await writeTables(client,clean);
  for(const [prefix,value] of sequences)await client.query('INSERT INTO metadata(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',['coil-sequence-'+prefix,String(value)]);
  await client.query("UPDATE metadata SET value=$1 WHERE key='revision'",[String(revision+1)]);return revision+1;
 });
}
export async function checkDatabase(){await pool.query('SELECT 1');}
