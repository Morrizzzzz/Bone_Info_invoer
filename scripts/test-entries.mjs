import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EMPTY_ENTRIES,CLUSTER_FIELDS,validateEntry,mergeEntries} from '../entries.js';
import {githubClient,encodeContent,decodeContent} from '../github-entry.js';
import {prepare,filterRows} from '../search.js';
const base=JSON.parse(fs.readFileSync(new URL('../data/boneinfo.json',import.meta.url),'utf8'));
const entry={id:'test-entry-001',createdAt:'2026-11-02T12:00:00.000Z',cluster:{...Object.fromEntries(CLUSTER_FIELDS.map(k=>[k,''])),Zoonr:'1900000000000001',Plaats:'Testplaats é 🦴',Beschrijving:'Test van relationele invoer',X_coord:'155000',Y_coord:'463000',Beginjaar:'100',Eindjaar:'200'},species:[{DiersoortID:base.tables.tblDiersoort[0].diersoortID,Opmerking:'Tést'}],publications:[{Auteursnaam:'Testauteur',Jaar:'2026',Artikel_titel:'Nieuwe bron',Boektitel:'',Periodiek:'',Deel:''}]};
assert.equal(decodeContent(encodeContent(JSON.stringify(entry))),JSON.stringify(entry));
validateEntry(entry,base);
for(const patch of [{X_coord:'4.9',Y_coord:'52.1'},{X_coord:'',Y_coord:'463000'},{Beginjaar:'0'},{Beginjaar:'201',Eindjaar:'200'},{Begin_periode:'niet-bestaand'}])assert.throws(()=>validateEntry({...entry,cluster:{...entry.cluster,...patch}},base));
assert.throws(()=>validateEntry({...entry,species:[{DiersoortID:'invalid',Opmerking:''}]},base));
assert.throws(()=>mergeEntries(base,{schemaVersion:1,entries:[entry,entry]}));
const merged=mergeEntries(base,{schemaVersion:1,entries:[entry]});
assert.equal(merged.tables.tblZoo_cluster.length,base.tables.tblZoo_cluster.length+1);
const db=prepare(merged);const found=filterRows(db.rows,{q:'Testplaats',species:base.tables.tblDiersoort[0].lat_omschrijving},db.periods);
assert.equal(found.length,1);assert.equal(found[0].publications[0].Artikel_titel,'Nieuwe bron');assert.equal(found[0].species[0].Volgnr,'1');
let stored=EMPTY_ENTRIES(),sha='initial',writes=0,mode='ok';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const fake=async(url,options)=>{
 assert.ok(url.startsWith('https://api.github.com/'));assert.equal(options.headers.Authorization,'Bearer TEST_ONLY');
 if(options.method==='PUT'){
  writes++;const body=JSON.parse(options.body);assert.equal(body.sha,sha);assert.equal(body.branch,'main');assert.ok(!body.content.includes('TEST_ONLY'));
  if(mode==='conflict')return response({},409);
  stored=JSON.parse(decodeContent(body.content));sha='new-blob';
  if(mode==='lost-response')throw new Error('network lost after commit');
  return response({commit:{sha:'1234567890abcdef'}},200);
 }
 return response({type:'file',sha,size:100,encoding:'base64',content:encodeContent(JSON.stringify(stored))});
};
const client=githubClient('TEST_ONLY',undefined,fake);
const saved=await client.save(entry,base);assert.equal(saved.sha,'1234567890abcdef');assert.equal(writes,1);assert.equal(stored.entries.length,1);
assert.equal((await client.save(entry,base)).alreadySaved,true);assert.equal(writes,1);
await assert.rejects(()=>client.save({...entry,cluster:{...entry.cluster,Plaats:'Gewijzigd'}},base),/andere inhoud/);
const second={...entry,id:'test-entry-002',cluster:{...entry.cluster,Zoonr:'1900000000000002'}};
mode='conflict';await assert.rejects(()=>client.save(second,base),/andere wijziging/);assert.equal(stored.entries.length,1);
mode='lost-response';await assert.rejects(()=>client.save(second,base),/Geen antwoord/);assert.equal(stored.entries.length,2);
mode='ok';assert.equal((await client.save(second,base)).alreadySaved,true);assert.equal(writes,3);
console.log('PASS: entry validation, UTF-8, relational search integration, atomic append, conflict refusal, idempotency and recovery after lost commit response. No GitHub writes performed.');
