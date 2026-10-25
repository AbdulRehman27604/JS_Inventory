import {Pool} from 'pg';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
let url;try{url=new URL(process.env.DATABASE_URL);}catch{throw Error('DATABASE_URL must be a valid PostgreSQL connection URL');}
if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL must use the postgres or postgresql protocol');
const sslMode=process.env.DATABASE_SSL||url.searchParams.get('sslmode');
const renderInternal=process.env.RENDER==='true'&&/^dpg-[a-z0-9-]+(?:\.internal)?$/.test(url.hostname);
if(renderInternal&&['verify-full','verify-ca'].includes(sslMode))throw Error('Render internal Postgres uses self-signed certificates; use its default internal connection or sslmode=require');
const useTLS=sslMode==='require'||sslMode==='verify-full'||(!sslMode&&(renderInternal||url.hostname.endsWith('.render.com')));
if(useTLS)url.searchParams.delete('sslmode');
export const pool=new Pool({connectionString:url.toString(),max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true,statement_timeout:20000,...(useTLS?{ssl:{rejectUnauthorized:!renderInternal}}:sslMode==='disable'?{ssl:false}:{})});
pool.on('error',error=>console.error('Database connection error:',error.code||'unknown'));
export async function transaction(run,{readOnly=false}={}){
 const client=await pool.connect();try{await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');const result=await run(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function ensureSchema(){
 await transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(72641001)');
  await client.query(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS collections (name TEXT PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL REFERENCES collections(name),code TEXT NOT NULL,position INTEGER NOT NULL,origin TEXT NOT NULL,fields JSON NOT NULL,PRIMARY KEY(collection,code));
   CREATE TABLE IF NOT EXISTS line_items (collection TEXT NOT NULL,record_code TEXT NOT NULL,position INTEGER NOT NULL,fields JSON NOT NULL,PRIMARY KEY(collection,record_code,position),FOREIGN KEY(collection,record_code) REFERENCES records(collection,code) ON DELETE CASCADE);
   CREATE TABLE IF NOT EXISTS auth_users (id TEXT PRIMARY KEY,username TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,created BIGINT NOT NULL,seen BIGINT NOT NULL);
   CREATE TABLE IF NOT EXISTS auth_attempts (id TEXT PRIMARY KEY,count INTEGER NOT NULL,start BIGINT NOT NULL);
   CREATE INDEX IF NOT EXISTS auth_sessions_seen ON auth_sessions(seen);`);
 });
}
await ensureSchema();
