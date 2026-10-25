import {existsSync} from 'node:fs';
import {definitions} from './dist/schema.js';
export async function loadLocalSeed(){
 const seed=existsSync(new URL('./dist/data.js',import.meta.url))?(await import('./dist/data.js')).definitions:definitions;
 return Object.fromEntries(Object.entries(seed).map(([name,d])=>[name,d.rows||[]]));
}
