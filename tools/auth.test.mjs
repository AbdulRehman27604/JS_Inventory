import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('protected inventory, credentials, CSRF, logout and rate limits',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'inventory-auth-'));
 const port=String(20000+Math.floor(Math.random()*20000)),base=`http://localhost:${port}`;
 const env={...process.env,PORT:port,INVENTORY_DB_PATH:path.join(directory,'inventory.sqlite')};
 const setup=spawn(process.execPath,['tools/set-user.mjs','test-admin'],{env,stdio:['pipe','pipe','pipe']});setup.stdin.end('T3st!x9Q-longer\n');
 assert.equal((await once(setup,'exit'))[0],0);
 const server=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe']});
 try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server failed');})]);
 for(const route of ['/','/index.html','/data.js','/app.js','/reference/example.png']){const r=await fetch(base+route,{redirect:'manual'});assert.equal(r.status,303,route);assert.equal(r.headers.get('location'),'/login');}
 assert.equal((await fetch(base+'/api/data')).status,401);
 assert.equal((await fetch(base+'/login')).status,200);
 assert.equal((await fetch(base+'/appearance.js')).status,200);
 const signin=async(password,origin=base)=>fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'test-admin',password})});
 assert.equal((await signin('x'.repeat(257))).status,400);
 assert.equal((await signin('wrong')).status,401);
 assert.equal((await signin('T3st!x9Q-longer','https://evil.example')).status,403);
 const signed=await signin('T3st!x9Q-longer');assert.equal(signed.status,200);
 const cookie=signed.headers.get('set-cookie').split(';')[0];assert.match(signed.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 const headers={Cookie:cookie,Origin:base,'Content-Type':'application/json'};
 const state=await (await fetch(base+'/api/auth/session',{headers})).json();assert.ok(state.csrf);
 const data=await fetch(base+'/api/data',{headers});assert.equal(data.status,200);const snapshot=await data.json();
 assert.equal((await fetch(base+'/data.js',{headers})).status,200);
 assert.equal((await fetch(base+'/api/data',{method:'PUT',headers,body:JSON.stringify(snapshot)})).status,403);
 headers['X-CSRF-Token']=state.csrf;
 assert.equal((await fetch(base+'/api/data',{method:'PUT',headers,body:JSON.stringify(snapshot)})).status,200);
 const page=await fetch(base+'/',{headers});assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(page.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers})).status,200);
 assert.equal((await fetch(base+'/api/data',{headers})).status,401);
 for(let i=0;i<10;i++)assert.equal((await signin('wrong')).status,401);
 assert.equal((await signin('wrong')).status,429);
 const raw=await readFile(path.join(directory,'auth.sqlite'));assert.ok(!raw.includes(Buffer.from('test-admin')));assert.ok(!raw.includes(Buffer.from('T3st!x9Q-longer')));
 }finally{if(server.exitCode===null){server.kill();await once(server,'exit');}await rm(directory,{recursive:true,force:true});}
});
