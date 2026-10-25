import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
import {Client} from 'pg';
import {appendCut,cuttingStock,CUTTING,RECEIVING} from '../dist/cutting.js';
test('PostgreSQL migration, concurrent saves, stock conservation, durable auth and Render HTTPS settings',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'inventory-pg-source-'));
 process.env.INVENTORY_DB_PATH=path.join(directory,'inventory.sqlite');
 const sqlite=await import('../sqlite-database.mjs'),sqliteAuth=await import('../sqlite-auth.mjs');
 await sqliteAuth.setUser('pg-admin','postgres-test-password');
 const source=sqlite.readInventory();source.tables[RECEIVING].push({Code:'PG-R1',Date:'2026-10-25',_lines:[{'Coil ID':'PG-COIL',Width:'900',Weight:'3000',UOM:'KG'}]});
 const cut=appendCut({Code:'PG-J1',Date:'2026-10-25','Coil Reference':'PG-R1/PG-COIL','Cutting Status':'Posted','Trim Disposition':'Scrap',_lines:[]},[{'Strip Size':'200',Quantity:'4'}],1500);source.tables[CUTTING].push(cut);sqlite.replaceInventory(source.tables,source.revision);
 const schemaName='inventory_test_'+Date.now(),schemaClient=new Client({connectionString:process.env.TEST_DATABASE_URL});await schemaClient.connect();await schemaClient.query('CREATE SCHEMA '+schemaName);const testURL=new URL(process.env.TEST_DATABASE_URL);testURL.searchParams.set('options','-c search_path='+schemaName);
 process.env.DATABASE_URL=testURL.toString();process.env.AUTH_ENCRYPTION_KEY=(await readFile(path.join(directory,'auth.key'))).toString('hex');
 const {pool}=await import('../postgres-store.mjs');let server;
 try{
  const {localSnapshot,importSnapshot}=await import('../migration.mjs');const db=await import('../postgres-database.mjs');
  const initial=await db.readInventory();assert.ok(Object.values(initial.tables).every(rows=>rows.length===0));
  const snapshot=localSnapshot({includeUsers:true});const count=await importSnapshot(snapshot,{includeUsers:true});assert.ok(count>160);
  let current=await db.readInventory();assert.ok(current.revision>initial.revision);assert.equal(await db.replaceInventory(initial.tables,initial.revision),null,'migration invalidates stale empty windows');assert.deepEqual(current.tables,sqlite.readInventory().tables);assert.equal(cuttingStock(current.tables).coils.get('PG-R1/PG-COIL').remainingWeight,1500);
  await assert.rejects(()=>importSnapshot(snapshot),/refuses to overwrite/);
  const a=structuredClone(current.tables),b=structuredClone(current.tables);a['Currency Setup'].push({Code:'PG-A',Caption:'A'});b['Currency Setup'].push({Code:'PG-B',Caption:'B'});
  const saves=await Promise.all([db.replaceInventory(a,current.revision),db.replaceInventory(b,current.revision)]);assert.equal(saves.filter(result=>result===null).length,1);assert.equal(saves.filter(Number.isInteger).length,1);
  current=await db.readInventory();assert.equal(current.tables['Currency Setup'].filter(r=>r.Code.startsWith('PG-')).length,1);
  const auth=await import('../postgres-auth.mjs');assert.ok((await auth.login('pg-admin','postgres-test-password','test')).token,'migrated password hashes work');assert.equal((await auth.login('pg-admin','incorrect','test')).token,undefined);
  const signed=await auth.login('pg-admin','postgres-test-password','test'),request={headers:{cookie:'inventory_session='+signed.token}};assert.ok(await auth.session(request));
  await auth.bootstrapAdmin('another-admin','bootstrap-password');assert.equal(Number((await pool.query('SELECT count(*) AS count FROM auth_users')).rows[0].count),1,'bootstrap never resets or replaces migrated accounts');
  await auth.setUser('pg-admin','new-postgres-password');assert.equal(await auth.session(request),null);
  const newLogin=await auth.login('pg-admin','new-postgres-password','test');assert.ok(newLogin.token);await auth.logout((await auth.session({headers:{cookie:'inventory_session='+newLogin.token}})).id);assert.equal(await auth.session({headers:{cookie:'inventory_session='+newLogin.token}}),null);
  const backupDirectory=path.join(directory,'backups');execFileSync(process.execPath,['tools/backup-database.mjs'],{env:{...process.env,INVENTORY_BACKUP_DIR:backupDirectory},stdio:'pipe'});const backupFile=path.join(backupDirectory,(await readdir(backupDirectory))[0]);const archive=JSON.parse(await readFile(backupFile,'utf8'));assert.equal(archive.format,2);assert.equal(archive.users.length,1);assert.ok(!JSON.stringify(archive).includes(process.env.AUTH_ENCRYPTION_KEY));
  const restoreSchema=schemaName+'_restore';await schemaClient.query('CREATE SCHEMA '+restoreSchema);const restoreURL=new URL(process.env.TEST_DATABASE_URL);restoreURL.searchParams.set('options','-c search_path='+restoreSchema);execFileSync(process.execPath,['tools/migrate-postgres.mjs','--from',backupFile,'--with-users'],{env:{...process.env,DATABASE_URL:restoreURL.toString()},stdio:'pipe'});assert.equal(Number((await schemaClient.query('SELECT count(*) AS count FROM '+restoreSchema+'.records')).rows[0].count),Object.values(archive.tables).reduce((sum,rows)=>sum+rows.length,0));
  // Cloud HTTPS origin and Secure cookies are tested through an HTTP proxy-style local request.
  const cloudRequest=(url,options={})=>new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method||'GET',headers:options.headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:{get:name=>{const value=res.headers[name.toLowerCase()];return Array.isArray(value)?value.join(','):value||null;}},json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.end(options.body);});
  const port=String(35000+Math.floor(Math.random()*5000)),base='http://127.0.0.1:'+port;
  server=spawn(process.execPath,['server.mjs'],{env:{...process.env,RENDER:'true',HOST:'127.0.0.1',PORT:port,PUBLIC_HOST:'inventory.example.test'},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Cloud test server failed');})]);
  assert.equal((await cloudRequest(base+'/healthz')).status,200);
  const headers={Host:'inventory.example.test',Origin:'https://inventory.example.test','Content-Type':'application/json'};
  assert.equal((await cloudRequest(base+'/api/data',{headers})).status,401);
  const response=await cloudRequest(base+'/api/auth/login',{method:'POST',headers,body:JSON.stringify({username:'pg-admin',password:'new-postgres-password'})});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Secure/);assert.match(response.headers.get('strict-transport-security'),/31536000/);
  const cookie=response.headers.get('set-cookie').split(';')[0],withCookie={...headers,Cookie:cookie};assert.equal((await cloudRequest(base+'/api/data',{headers:withCookie})).status,200);
  const csrf=(await(await cloudRequest(base+'/api/auth/session',{headers:withCookie})).json()).csrf;
  assert.equal((await cloudRequest(base+'/api/data',{method:'PUT',headers:withCookie,body:JSON.stringify(await db.readInventory())})).status,403);
  assert.equal((await cloudRequest(base+'/api/data',{method:'PUT',headers:{...withCookie,'X-CSRF-Token':csrf},body:JSON.stringify(await db.readInventory())})).status,200);
  server.kill();await once(server,'exit');server=null;
  // A new process can read the previous process's session; no cookie state depends on local files.
  server=spawn(process.execPath,['server.mjs'],{env:{...process.env,RENDER:'true',HOST:'127.0.0.1',PORT:port,PUBLIC_HOST:'inventory.example.test'},stdio:['ignore','pipe','pipe']});await once(server.stdout,'data');assert.equal((await cloudRequest(base+'/api/data',{headers:withCookie})).status,200);
  const output=await db.readInventory();assert.equal(cuttingStock(output.tables).coils.get('PG-R1/PG-COIL').remainingWeight,1500);
 }finally{
  if(server&&server.exitCode===null){server.kill();await once(server,'exit');}
  await pool.end();await schemaClient.query('DROP SCHEMA IF EXISTS '+schemaName+'_restore CASCADE');await schemaClient.query('DROP SCHEMA '+schemaName+' CASCADE');await schemaClient.end();await rm(directory,{recursive:true,force:true});delete process.env.DATABASE_URL;delete process.env.INVENTORY_DB_PATH;
 }
});
