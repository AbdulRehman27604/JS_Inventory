import {mkdir,copyFile,access} from 'node:fs/promises';
import {definitions} from '../dist/schema.js';
if(Object.values(definitions).some(definition=>definition.rows?.length))throw Error('The public schema must not contain private business records');
await mkdir(new URL('../dist/assets/',import.meta.url),{recursive:true});
for(const name of ['desktop.png','toolbar.png'])await copyFile(new URL('../assets/'+name,import.meta.url),new URL('../dist/assets/'+name,import.meta.url));
for(const file of ['app.js','schema.js','index.html','classic-appearance.css','cutting-reuse.js'])await access(new URL('../dist/'+file,import.meta.url));
console.log('Render build ready. Runtime assets copied; private inventory and authentication files are excluded.');
