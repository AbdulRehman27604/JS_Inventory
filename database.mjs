import {validateGRNSetups} from './grn-setups.mjs';
import {assignCoilIDs} from './coil-ids.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateCuttingChanges} from './dist/cutting.js';
import {definitions} from './dist/data.js';

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
 try{writeTables(validateTables(Object.fromEntries(Object.entries(definitions).map(([name,d])=>[name,d.rows]))));setRevision.run('1');db.exec('COMMIT');}
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
