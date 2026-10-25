import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {definitions} from './dist/schema.js';
import {validateTables} from './inventory-validation.mjs';
import {cuttingStock} from './dist/cutting.js';
export function localSnapshot({includeUsers=false}={}){
 const file=process.env.INVENTORY_DB_PATH?path.resolve(process.env.INVENTORY_DB_PATH):fileURLToPath(new URL('./data/inventory.sqlite',import.meta.url));
 const db=new DatabaseSync(file,{readOnly:true});let snapshot;
 try{
  db.exec('BEGIN');const tables=Object.fromEntries(Object.keys(definitions).map(name=>[name,[]]));const byRecord=new Map();
  for(const line of db.prepare('SELECT * FROM line_items ORDER BY collection,record_code,position').all()){const key=JSON.stringify([line.collection,line.record_code]);if(!byRecord.has(key))byRecord.set(key,[]);byRecord.get(key).push(JSON.parse(line.fields));}
  for(const row of db.prepare('SELECT * FROM records ORDER BY collection,position').all()){if(!definitions[row.collection])throw Error('Unknown source collection');const record={...JSON.parse(row.fields),_origin:row.origin};if(definitions[row.collection].kind==='transaction')record._lines=byRecord.get(JSON.stringify([row.collection,row.code]))||[];tables[row.collection].push(record);}
  const metadata=db.prepare('SELECT key,value FROM metadata').all();snapshot={format:2,exportedAt:new Date().toISOString(),tables:validateTables(tables),metadata};cuttingStock(snapshot.tables);db.exec('COMMIT');
 }finally{db.close();}
 if(includeUsers){
  const auth=new DatabaseSync(path.join(path.dirname(file),'auth.sqlite'),{readOnly:true});try{snapshot.users=auth.prepare('SELECT id,username,salt,hash FROM users').all();}finally{auth.close();}
  snapshot.authFingerprint=createHash('sha256').update(readFileSync(path.join(path.dirname(file),'auth.key'))).digest('hex');
 }
 return snapshot;
}
export async function importSnapshot(snapshot,{includeUsers=false}={}){
 if(snapshot.format!==2||!Array.isArray(snapshot.metadata))throw Error('Invalid migration archive');
 const clean=validateTables(snapshot.tables);cuttingStock(clean);
 const {transaction}=await import('./postgres-store.mjs'),{writeTables}=await import('./postgres-database.mjs');
 return transaction(async client=>{
  const locked=await client.query("SELECT value FROM metadata WHERE key='revision' FOR UPDATE");
  const previousRevision=Number(locked.rows[0].value);
  if(Number((await client.query('SELECT count(*) AS count FROM records')).rows[0].count)!==0)throw Error('The destination already contains inventory. Migration refuses to overwrite it');
  if(includeUsers){
   if(!Array.isArray(snapshot.users)||!snapshot.authFingerprint)throw Error('This archive does not contain accounts');
   if((await client.query('SELECT 1 FROM auth_users LIMIT 1')).rowCount)throw Error('The destination already has accounts. Use inventory-only migration or a new empty database');
   const secret=process.env.AUTH_ENCRYPTION_KEY||'',key=/^[a-fA-F0-9]{64}$/.test(secret)?Buffer.from(secret,'hex'):createHash('sha256').update(secret).digest();
   if(secret.length<32||createHash('sha256').update(key).digest('hex')!==snapshot.authFingerprint)throw Error('AUTH_ENCRYPTION_KEY must match the source accounts key');
   const existing=(await client.query("SELECT value FROM metadata WHERE key='auth-key-fingerprint'")).rows[0];if(existing&&existing.value!==snapshot.authFingerprint)throw Error('Destination authentication key differs');
   for(const user of snapshot.users)await client.query('INSERT INTO auth_users(id,username,salt,hash) VALUES($1,$2,$3,$4)',[user.id,user.username,user.salt,user.hash]);
   await client.query("INSERT INTO metadata(key,value) VALUES('auth-key-fingerprint',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[snapshot.authFingerprint]);
  }
  await writeTables(client,clean);
  for(const entry of snapshot.metadata){if(['auth-key-fingerprint','revision'].includes(entry.key))continue;await client.query('INSERT INTO metadata(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[entry.key,String(entry.value)]);}
  const sourceRevision=Number(snapshot.metadata.find(entry=>entry.key==='revision')?.value||1);
  await client.query("UPDATE metadata SET value=$1 WHERE key='revision'",[String(Math.max(previousRevision,sourceRevision)+1)]);
  await client.query("INSERT INTO metadata(key,value) VALUES('cloud-imported-at',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[new Date().toISOString()]);
  return Object.values(clean).reduce((count,rows)=>count+rows.length,0);
 });
}
