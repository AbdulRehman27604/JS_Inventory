import {readFile} from 'node:fs/promises';
import {localSnapshot,importSnapshot} from '../migration.mjs';
const withUsers=process.argv.includes('--with-users'),fileIndex=process.argv.indexOf('--from');
const snapshot=fileIndex>=0?JSON.parse(await readFile(process.argv[fileIndex+1],'utf8')):localSnapshot({includeUsers:withUsers});
if(process.argv.includes('--dry-run')){console.log('Migration source validated:',Object.values(snapshot.tables).reduce((n,rows)=>n+rows.length,0),'records. No destination was changed.');}
else{
 if(!process.env.DATABASE_URL)throw Error('Set DATABASE_URL to the PostgreSQL destination; do not put it in source code');
 try{console.log('Migrated',await importSnapshot(snapshot,{includeUsers:withUsers}),'inventory records. Existing destination records are never overwritten.');}
 finally{const {pool}=await import('../postgres-store.mjs');await pool.end();}
}
