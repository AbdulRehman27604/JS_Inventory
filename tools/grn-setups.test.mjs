import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateGRNSetups,categoryPrefix} from '../grn-setups.mjs';
import {assignCoilIDs} from '../coil-ids.mjs';
const fixture=()=>({'Item Master Setup':[{Code:'I1',Description:'CRC COIL 1.2 MM X 1200 MM'}],'Item Main Category':[{Code:'001',Name:'CRC COIL',Prefix:'C'}],'GRN (Goods Received Note)':[{Code:'R1',Date:'2026-10-25',_lines:[{'Item Code':'I1','Item Description':'incorrect','Coil Type':'CRC COIL','Coil Code':'001'}]}]});
test('GRN uses the item master and matching existing main category and generates its prefix/code',()=>{
 const tables=fixture();validateGRNSetups(tables,{});assert.equal(tables['GRN (Goods Received Note)'][0]._lines[0]['Item Description'],'CRC COIL 1.2 MM X 1200 MM');assignCoilIDs(tables,()=>0,()=>{});assert.equal(tables['GRN (Goods Received Note)'][0]._lines[0]['Coil ID'],'C-001-00001-2026');
 assert.equal(categoryPrefix({Name:'HRC COIL'}),'H');assert.equal(categoryPrefix({Name:'special coil',Prefix:'Z'}),'Z');
});
test('rejects unknown items and mismatched coil selections',()=>{
 for(const changes of [{'Item Code':'missing'},{'Coil Code':'002'},{'Coil Type':'HRC'}]){const tables=fixture();Object.assign(tables['GRN (Goods Received Note)'][0]._lines[0],changes);assert.throws(()=>validateGRNSetups(tables,{}));}
 const bad=fixture();bad['Item Main Category'][0].Prefix='LONG';assert.throws(()=>validateGRNSetups(bad,{}),/prefix/);
});
test('changing setup does not rewrite historical receipt snapshots or existing coil IDs',()=>{
 const previous=fixture();previous['GRN (Goods Received Note)'][0]._lines[0]['Coil ID']='C-001-00001-2026';const tables=structuredClone(previous);tables['Item Master Setup']=[];tables['Item Main Category'][0].Name='Renamed category';validateGRNSetups(tables,previous);assignCoilIDs(tables,()=>1,()=>{});assert.deepEqual(tables['GRN (Goods Received Note)'],previous['GRN (Goods Received Note)']);
});

test('category code disambiguates equal names and retired prefixes retain numbering history',()=>{
 const tables=fixture();tables['Item Main Category']=[{Code:'001',Name:'COIL',Prefix:'C'},{Code:'002',Name:'COIL',Prefix:'X'}];tables['GRN (Goods Received Note)'][0]._lines=[{'Item Code':'I1','Coil Type':'COIL','Coil Code':'001'},{'Item Code':'I1','Coil Type':'COIL','Coil Code':'002'}];validateGRNSetups(tables,{});const counters={};assignCoilIDs(tables,p=>counters[p]||0,(p,v)=>counters[p]=v);assert.deepEqual(tables['GRN (Goods Received Note)'][0]._lines.map(l=>l['Coil ID']),['C-001-00001-2026','X-002-00001-2026']);
 counters.C=100;tables['Item Main Category']=tables['Item Main Category'].filter(c=>c.Prefix!=='C');assignCoilIDs(tables,p=>counters[p]||0,(p,v)=>counters[p]=v);assert.equal(counters.C,100);
});
