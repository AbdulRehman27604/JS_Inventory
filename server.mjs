import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readInventory,replaceInventory} from './database.mjs';
import {login,session,logout} from './auth.mjs';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const port=Number(process.env.PORT||4173);
const secure=process.env.COOKIE_SECURE==='1';
const origin=`${secure?'https':'http'}://${process.env.PUBLIC_HOST||`localhost:${port}`}`;
const hosts=[new URL(origin).host,...(!secure?[`127.0.0.1:${port}`]:[])];
const origins=[origin,...(!secure?[`http://127.0.0.1:${port}`]:[])];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
const cookie=(token,age)=>`inventory_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
async function body(req,max=16384){
 if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('JSON required'),{status:415});
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(Error('Request too large'),{status:413});chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
 if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
 const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const redirect=to=>{res.writeHead(303,{Location:to});res.end();};
 try{
 if(!hosts.includes(req.headers.host))return json(403,{error:'Host not allowed'});
 const url=new URL(req.url,'http://localhost');
 if(!['GET','HEAD','POST','PUT'].includes(req.method))return json(405,{error:'Method not allowed'});
 if(['POST','PUT'].includes(req.method)&&(!origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site'))return json(403,{error:'Origin not allowed'});
 if(url.pathname==='/api/auth/login'&&req.method==='POST'){
 const input=await body(req);
 if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>100||input.password.length>256)return json(400,{error:'Invalid credentials'});
 const result=await login(input.username,input.password,req.socket.remoteAddress);
 if(result.limited){res.setHeader('Retry-After','900');return json(429,{error:'Too many attempts. Try again in 15 minutes.'});}
 if(!result.token)return json(401,{error:'Invalid username or password'});
 res.setHeader('Set-Cookie',cookie(result.token,28800));return json(200,{ok:true});
 }
 const publicFiles={'/login':'login.html','/login.js':'login.js','/login.css':'login.css','/appearance.js':'appearance.js'};
 const user=session(req);
 if(!user&&!Object.hasOwn(publicFiles,url.pathname))return url.pathname.startsWith('/api/')?json(401,{error:'Please sign in'}):redirect('/login');
 if(user&&url.pathname==='/login')return redirect('/');
 if(url.pathname==='/api/auth/session'&&req.method==='GET')return json(200,{csrf:user.csrf});
 if(['POST','PUT'].includes(req.method)&&req.headers['x-csrf-token']!==user?.csrf)return json(403,{error:'Invalid security token'});
 if(url.pathname==='/api/auth/logout'&&req.method==='POST'){logout(user.id);res.setHeader('Set-Cookie',cookie('',0));return json(200,{ok:true});}
 if(url.pathname==='/api/data'){
 if(req.method==='GET')return json(200,readInventory());
 if(req.method!=='PUT')return json(405,{error:'Method not allowed'});
 const input=await body(req,10*1024*1024);
 if(!Number.isSafeInteger(input.revision))return json(400,{error:'Revision required'});
 let revision;try{revision=replaceInventory(input.tables,input.revision);}catch(error){return json(400,{error:error.message});}
 return revision===null?json(409,{error:'Data changed in another window. Reload before saving.'}):json(200,{revision,tables:readInventory().tables});
 }
 if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Method not allowed'});
 const name=publicFiles[url.pathname]||decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
 const file=path.resolve(root,'.'+(name.startsWith('/')?name:'/'+name));
 if(!file.startsWith(root)||path.relative(root,file).split(path.sep).some(p=>p.startsWith('.')))return json(404,{error:'Not found'});
 const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
 }catch(error){return json(error.status||404,{error:error.status?error.message:'Not found'});}
});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
server.listen(port,'127.0.0.1',()=>console.log(`Inventory: http://localhost:${port} (login required)`));
server.on('error',e=>{console.error(e.code);process.exitCode=1;});
