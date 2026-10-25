import {validateGRNSetups} from './grn-setups.mjs';
import {assignCoilIDs} from './coil-ids.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateCuttingChanges} from './dist/cutting.js';
import {definitions} from './dist/schema.js';
import {validateTables} from './inventory-validation.mjs';
import {loadLocalSeed} from './seed-data.mjs';

export const databasePath = process.env.INVENTORY_DB_PATH ? path.resolve(process.env.INVENTORY_DB_PATH) : fileURLToPath(new URL('./data/inventory.sqlite',import.meta.url));
const directory = path.dirname(databasePath);
mkdirSync(directory,{recursive:true,mode:0o700});
const db = new DatabaseSync(databasePath);
db.exec(`PRAGMA foreign_keys = ON;
 PRAGMA journal_mode = WAL;
 CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS collections (name TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS records (
  collection TEXT NOT NULL REFERENCES collections(name), code TEXT NOT NULL,
  position INTEGER NOT NULL, origin TEXT NOT NULL, fields TEXT NOT NULL,
  PRIMARY KEY(collection,code)
 );
 CREATE TABLE IF NOT EXISTS line_items (
  collection TEXT NOT NULL, record_code TEXT NOT NULL, position INTEGER NOT NULL,
  fields TEXT NOT NULL, PRIMARY KEY(collection,record_code,position),
  FOREIGN KEY(collection,record_code) REFERENCES records(collection,code) ON DELETE CASCADE
 );`);
const getRevision=db.prepare("SELECT value FROM metadata WHERE key='revision'");
const setRevision=db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES('revision',?)");
const insertCollection=db.prepare('INSERT OR IGNORE INTO collections(name) VALUES(?)');
const insertRecord=db.prepare('INSERT INTO records(collection,code,position,origin,fields) VALUES(?,?,?,?,?)');
const insertLine=db.prepare('INSERT INTO line_items(collection,record_code,position,fields) VALUES(?,?,?,?)');
function writeTables(tables){
 db.exec('DELETE FROM line_items; DELETE FROM records');
 for(const [name,records] of Object.entries(tables)){
  insertCollection.run(name);
  records.forEach((record,position)=>{
   const {_origin,_lines,...fields}=record;
   insertRecord.run(name,record.Code,position,_origin||'captured',JSON.stringify(fields));
   (_lines||[]).forEach((line,i)=>insertLine.run(name,record.Code,i,JSON.stringify(line)));
  });
 }
}
if(!getRevision.get()){
 db.exec('BEGIN IMMEDIATE');
 try{writeTables(validateTables(await loadLocalSeed()));setRevision.run('1');db.exec('COMMIT');}
 catch(error){db.exec('ROLLBACK');throw error;}
}
export function readInventory(){
 const tables=Object.fromEntries(Object.keys(definitions).map(name=>[name,[]]));
 const lines=db.prepare('SELECT * FROM line_items ORDER BY collection,record_code,position').all();
 const byRecord=new Map();for(const line of lines){const key=JSON.stringify([line.collection,line.record_code]);if(!byRecord.has(key))byRecord.set(key,[]);byRecord.get(key).push(JSON.parse(line.fields));}
 for(const row of db.prepare('SELECT * FROM records ORDER BY collection,position').all()){
  const record={...JSON.parse(row.fields),_origin:row.origin};
  if(definitions[row.collection].kind==='transaction')record._lines=byRecord.get(JSON.stringify([row.collection,row.code]))||[];
  tables[row.collection].push(record);
 }
 return {revision:Number(getRevision.get().value),tables};
}
export function replaceInventory(tables,expectedRevision){
 const clean=validateTables(tables);
 db.exec('BEGIN IMMEDIATE');
 try{
  const revision=Number(getRevision.get().value);
  if(revision!==expectedRevision){db.exec('ROLLBACK');return null;}
  const previous=readInventory().tables;
  const getSequence=prefix=>Number(db.prepare('SELECT value FROM metadata WHERE key=?').get('coil-sequence-'+prefix)?.value||0);
  validateGRNSetups(clean,previous);
  assignCoilIDs(clean,getSequence,
   (prefix,value)=>db.prepare('INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)').run('coil-sequence-'+prefix,String(value)));
  validateCuttingChanges(clean,previous);
  writeTables(clean);setRevision.run(String(revision+1));db.exec('COMMIT');return revision+1;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
