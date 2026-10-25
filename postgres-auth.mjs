import {randomBytes,createHash,createHmac,scrypt as derive,timingSafeEqual,createCipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {pool,transaction} from './postgres-store.mjs';
const secret=process.env.AUTH_ENCRYPTION_KEY||'';
if(secret.length<32||secret.startsWith('REPLACE_'))throw Error('AUTH_ENCRYPTION_KEY must be a persistent random secret of at least 32 characters');
const key=/^[a-fA-F0-9]{64}$/.test(secret)?Buffer.from(secret,'hex'):createHash('sha256').update(secret).digest(),fingerprint=createHash('sha256').update(key).digest('hex');
await pool.query("INSERT INTO metadata(key,value) VALUES('auth-key-fingerprint',$1) ON CONFLICT DO NOTHING",[fingerprint]);
if((await pool.query("SELECT value FROM metadata WHERE key='auth-key-fingerprint'")).rows[0].value!==fingerprint)throw Error('Authentication key does not match the existing database');
const scrypt=promisify(derive),options={N:32768,r:8,p:1,maxmem:64*1024*1024};
let active=0;const waiting=[];
async function hashPassword(password,salt){if(active>=2)await new Promise(resolve=>waiting.push(resolve));else active++;try{return await scrypt(password,salt,64,options);}finally{if(waiting.length)waiting.shift()();else active--;}}
const digest=value=>createHash('sha256').update(value).digest('hex');
const userID=value=>createHmac('sha256',key).update(value.trim().toLowerCase()).digest('hex');
export async function setUser(username,password){
 if(!/^[a-zA-Z0-9_.@-]{3,100}$/.test(username))throw Error('Username must be 3–100 letters, digits, or _.@-');
 if(typeof password!=='string'||password.length<8||password.length>256)throw Error('Password must be 8–256 characters');
 const salt=randomBytes(16).toString('hex'),hash=(await hashPassword(password,salt)).toString('hex'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([iv,cipher.update(username,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64'),id=userID(username);
 await transaction(async client=>{await client.query('INSERT INTO auth_users(id,username,salt,hash) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,salt=EXCLUDED.salt,hash=EXCLUDED.hash',[id,encrypted,salt,hash]);await client.query('DELETE FROM auth_sessions WHERE user_id=$1',[id]);});
}
export async function login(username,password,address){
 const now=Date.now(),id=userID(username),buckets=['global',`ip:${address}`,`user:${id}`];
 const allowed=await transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(72641003)');await client.query('DELETE FROM auth_attempts WHERE start<$1',[now-900000]);
  const {rows}=await client.query('SELECT * FROM auth_attempts WHERE id=ANY($1::text[])',[buckets]);if(rows.some(row=>row.count>=(row.id==='global'?100:10)))return false;
  for(const bucket of buckets)await client.query('INSERT INTO auth_attempts(id,count,start) VALUES($1,1,$2) ON CONFLICT(id) DO UPDATE SET count=auth_attempts.count+1',[bucket,now]);return true;
 });
 if(!allowed)return {limited:true};
 const user=(await pool.query('SELECT * FROM auth_users WHERE id=$1',[id])).rows[0];
 const hash=await hashPassword(password,user?.salt||'00000000000000000000000000000000');if(!user||!timingSafeEqual(hash,Buffer.from(user.hash,'hex')))return {};
 return transaction(async client=>{
  const current=(await client.query('SELECT hash FROM auth_users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!current||current.hash!==user.hash)return {};
  await client.query('DELETE FROM auth_attempts WHERE id=ANY($1::text[])',[buckets.slice(1)]);
  await client.query('DELETE FROM auth_sessions WHERE seen<$1 OR created<$2',[now-1800000,now-28800000]);
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await client.query('INSERT INTO auth_sessions(id,user_id,csrf,created,seen) VALUES($1,$2,$3,$4,$4)',[digest(token),id,csrf,now]);return {token,csrf};
 });
}
export async function session(req){
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('inventory_session='))?.slice(18);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const now=Date.now(),id=digest(token);const result=await pool.query('UPDATE auth_sessions SET seen=$1 WHERE id=$2 AND seen>=$3 AND created>=$4 RETURNING *',[now,id,now-1800000,now-28800000]);return result.rows[0]||null;
}
export async function logout(id){await pool.query('DELETE FROM auth_sessions WHERE id=$1',[id]);}

export async function bootstrapAdmin(username,password){
 if(!/^[a-zA-Z0-9_.@-]{3,100}$/.test(username)||typeof password!=='string'||password.length<8||password.length>256||password.startsWith('REPLACE_'))throw Error('Initial administrator requires a valid username and an 8–256 character password');
 await transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(72641004)');
  if((await client.query('SELECT 1 FROM auth_users LIMIT 1')).rowCount)return;
  const salt=randomBytes(16).toString('hex'),hash=(await hashPassword(password,salt)).toString('hex'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([iv,cipher.update(username,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
  await client.query('INSERT INTO auth_users(id,username,salt,hash) VALUES($1,$2,$3,$4)',[userID(username),encrypted,salt,hash]);
 });
}
