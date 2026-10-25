if(process.env.DATABASE_URL){await import('./backup-postgres.mjs');}else{
const {DatabaseSync}=await import('node:sqlite');
const {mkdirSync}=await import('node:fs');
const {fileURLToPath}=await import('node:url');
const {databasePath}=await import('../database.mjs');
const folder=fileURLToPath(new URL('../backups/',import.meta.url));
mkdirSync(folder,{recursive:true,mode:0o700});
const destination=folder+'inventory-'+new Date().toISOString().replaceAll(/[:.]/g,'-')+'.sqlite';
const db=new DatabaseSync(databasePath);
db.prepare('VACUUM INTO ?').run(destination);
db.close();
console.log(destination);

}
