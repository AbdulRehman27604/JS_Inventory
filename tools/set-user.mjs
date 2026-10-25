import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {setUser} from '../auth.mjs';
const username=process.argv[2];
if(!username){console.error('Usage: npm run user:set -- USERNAME (creates an account or resets its password)');process.exit(1);}
let password='';
if(process.stdin.isTTY){
 const hiddenOutput=new Writable({write(_chunk,_encoding,callback){callback();}});
 const readline=createInterface({input:process.stdin,output:hiddenOutput,terminal:true,historySize:0});
 try{
  do{
   process.stdout.write('Password (8–256 characters; input is hidden): ');
   password=await readline.question('');
   process.stdout.write('\n');
   if((password.length<8||password.length>256))console.error(`You entered ${password.length} characters. Please enter 8–256 characters and press Enter.`);
  }while((password.length<8||password.length>256));
 }finally{
  readline.close();hiddenOutput.end();
 }
}else{for await(const chunk of process.stdin){password+=chunk;if(password.length>1024)throw Error('Input too long');}password=password.replace(/\r?\n$/,'');}
try{await setUser(username,password);console.log(`Account saved. Username: ${username}. You can now sign in with the password you just entered. Previous sessions for this account were revoked.`);}catch(e){console.error(e.message);process.exitCode=1;}
