import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const moduleURL=new URL('../dist/date-utils.js',import.meta.url).href;
test('new-document dates follow the local day near midnight, including year boundaries',()=>{
 for(const [timezone,instant,expected] of [['America/Vancouver','2026-01-01T00:30:00Z','2025-12-31'],['Asia/Karachi','2026-01-01T22:30:00Z','2026-01-02'],['UTC','2024-02-29T12:00:00Z','2024-02-29']]){
  const script=`import {localISODate} from ${JSON.stringify(moduleURL)};process.stdout.write(localISODate(new Date(${JSON.stringify(instant)})));`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:timezone},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,expected,timezone);
 }
});
