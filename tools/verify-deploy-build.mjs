// Validate the same safe file set a Git-based Render deploy receives, without private local files.
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,access,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=await mkdtemp(path.join(tmpdir(),'inventory-deploy-'));
let server;
try{
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of new Set(files)){const target=path.join(directory,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,file),target);}
 for(const file of ['dist/data.js','data/inventory.sqlite','data/auth.sqlite','data/auth.key','.env.render.local'])await assert.rejects(()=>access(path.join(directory,file)));
 for(const args of [['ci','--ignore-scripts'],['run','build'],['run','check']])execFileSync('npm',args,{cwd:directory,stdio:'inherit'});
 const env={...process.env,DATABASE_URL:'',RENDER:'',HOST:'127.0.0.1',PUBLIC_HOST:'',PORT:String(41000+Math.floor(Math.random()*3000))};
 const setup=spawn(process.execPath,['tools/set-user.mjs','clean-admin'],{cwd:directory,env,stdio:['pipe','ignore','ignore']});setup.stdin.end('clean-build-password\n');assert.equal((await once(setup,'exit'))[0],0);
 server=spawn(process.execPath,['server.mjs'],{cwd:directory,env,stdio:['ignore','pipe','pipe']});await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Clean build server did not start');})]);
 const base='http://127.0.0.1:'+env.PORT;assert.equal((await fetch(base+'/healthz')).status,200);
 const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'clean-admin',password:'clean-build-password'})});assert.equal(response.status,200);const headers={Cookie:response.headers.get('set-cookie').split(';')[0]};
 for(const asset of ['/','/app.js','/schema.js','/classic-appearance.css','/appearance.js','/assets/desktop.png','/assets/toolbar.png'])assert.equal((await fetch(base+asset,{headers})).status,200,asset);
 assert.equal((await fetch(base+'/data.js',{headers})).status,404);
 const snapshot=await(await fetch(base+'/api/data',{headers})).json();assert.ok(Object.values(snapshot.tables).every(rows=>rows.length===0));
 console.log('PASS: clean Git file set builds and starts without captured records, local databases, secrets or ignored runtime assets.');
}finally{if(server&&server.exitCode===null){server.kill();await once(server,'exit');}await rm(directory,{recursive:true,force:true});}
