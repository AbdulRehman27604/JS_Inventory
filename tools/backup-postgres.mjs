import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {transaction,pool} from '../postgres-store.mjs';
import {readWithClient} from '../postgres-database.mjs';
try{
 const archive=await transaction(async client=>({format:2,exportedAt:new Date().toISOString(),...(await readWithClient(client)),metadata:(await client.query('SELECT key,value FROM metadata')).rows,users:(await client.query('SELECT id,username,salt,hash FROM auth_users')).rows,authFingerprint:(await client.query("SELECT value FROM metadata WHERE key='auth-key-fingerprint'")).rows[0]?.value}),{readOnly:true});
 const folder=process.env.INVENTORY_BACKUP_DIR?pathToFileURL(path.resolve(process.env.INVENTORY_BACKUP_DIR)+path.sep):new URL('../backups/',import.meta.url);await mkdir(folder,{recursive:true,mode:0o700});const file=new URL('postgres-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',folder);await writeFile(file,JSON.stringify(archive),{flag:'wx',mode:0o600});console.log('PostgreSQL backup saved:',file.pathname);
}finally{await pool.end();}
