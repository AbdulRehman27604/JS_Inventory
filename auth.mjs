import {DatabaseSync} from 'node:sqlite';
import {randomBytes, createHash, createHmac, scrypt as derive, timingSafeEqual, createCipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync, readFileSync, writeFileSync, chmodSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(process.env.INVENTORY_DB_PATH ? path.resolve(process.env.INVENTORY_DB_PATH) : fileURLToPath(new URL('./data/inventory.sqlite',import.meta.url)));
mkdirSync(directory,{recursive:true,mode:0o700});
const keyPath=path.join(directory,'auth.key');
try{writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
const key=readFileSync(keyPath);if(key.length!==32)throw Error('Invalid authentication encryption key');
chmodSync(keyPath,0o600);
const db=new DatabaseSync(path.join(directory,'auth.sqlite'));chmodSync(path.join(directory,'auth.sqlite'),0o600);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, count INTEGER NOT NULL, start INTEGER NOT NULL);`);
const scrypt=promisify(derive), options={N:32768,r:8,p:1,maxmem:64*1024*1024};
const digest=value=>createHash('sha256').update(value).digest('hex');
const userID=value=>createHmac('sha256',key).update(value.trim().toLowerCase()).digest('hex');
export async function setUser(username,password){
 if(!/^[a-zA-Z0-9_.@-]{3,100}$/.test(username))throw Error('Username must be 3–100 letters, digits, or _.@-');
 if(typeof password!=='string'||(password.length<8||password.length>256))throw Error('Password must be 8–256 characters');
 const salt=randomBytes(16).toString('hex'), hash=(await scrypt(password,salt,64,options)).toString('hex');
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([iv,cipher.update(username,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
 const id=userID(username);
 db.prepare('INSERT OR REPLACE INTO users VALUES(?,?,?,?)').run(id,encrypted,salt,hash);
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
}
export async function login(username,password,address){
 const now=Date.now(), id=userID(username), buckets=['global',`ip:${address}`,`user:${id}`];
 db.prepare('DELETE FROM attempts WHERE start<?').run(now-900000);
 if(buckets.some(b=>{const a=db.prepare('SELECT count FROM attempts WHERE id=?').get(b);return a&&a.count>=(b==='global'?100:10);}))return {limited:true};
 for(const b of buckets)db.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').run(b,now);
 const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const hash=await scrypt(password,user?.salt||'00000000000000000000000000000000',64,options);
 if(!user||!timingSafeEqual(hash,Buffer.from(user.hash,'hex')))return {};
 for(const b of buckets.slice(1))db.prepare('DELETE FROM attempts WHERE id=?').run(b);
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
 db.prepare('DELETE FROM sessions WHERE seen<? OR created<?').run(now-1800000,now-28800000);
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(digest(token),id,csrf,now,now);
 return {token,csrf};
}
export function session(req){
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('inventory_session='))?.slice(18);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const id=digest(token),row=db.prepare('SELECT * FROM sessions WHERE id=?').get(id),now=Date.now();
 if(!row)return null;
 if(now-row.seen>1800000||now-row.created>28800000){db.prepare('DELETE FROM sessions WHERE id=?').run(id);return null;}
 db.prepare('UPDATE sessions SET seen=? WHERE id=?').run(now,id);return row;
}
export function logout(id){db.prepare('DELETE FROM sessions WHERE id=?').run(id);}
