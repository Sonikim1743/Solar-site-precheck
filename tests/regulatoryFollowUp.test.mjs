import test from 'node:test'
import assert from 'node:assert/strict'
import { FOLLOW_UP_TOPICS, followUpContact, followUpPointKey, createFollowUpRecord, parseFollowUpRecord } from '../src/utils/regulatoryFollowUp.js'

const point={lat:35,lon:130}
const notes={farmland:{status:'recorded',checkedOn:'2026-11-04',department:'合成の確認窓口',answer:'相談内容と残る条件 <script>plain text</script>'}}
const result=region=>({hazards:{mode:'stored',region:{state:'ready',code:'33',municipality:'33210',municipalityState:'ready',...region}}})

test('verified contacts require an unambiguous municipality from the point result',()=>{
  const known=followUpContact('farmland',result())
  assert.equal(known.phone,'0867-72-6106');assert.match(known.url,/www\.city\.niimi\.okayama\.jp/)
  for(const input of [result({state:'unconfirmed'}),result({municipalityState:'unconfirmed'}),result({municipality:'33209'}),result({code:'34'}),{hazards:{mode:'raster',region:result().hazards.region}},{}]){
    const contact=followUpContact('farmland',input)
    assert.equal(contact.verified,false);assert.equal(contact.phone,undefined);assert.doesNotMatch(contact.office,/新見市/)
  }
  assert.match(followUpContact('soil',result()).note,/許認可担当ではありません/)
  assert.equal(followUpContact('culture',result()).verified,false)
  assert.equal(followUpContact('zoning',result()).verified,false)
  assert.equal(followUpContact('zoning',result()).phone,undefined)
})

test('answer records round-trip only into their exact selected point',()=>{
  const record=createFollowUpRecord(point,notes,'2026-11-04T00:00:00Z')
  assert.deepEqual(parseFollowUpRecord(JSON.stringify(record),point),notes)
  assert.throws(()=>parseFollowUpRecord(JSON.stringify(record),{...point,lon:130.00000001}),/対象地点が異なり/)
  assert.throws(()=>parseFollowUpRecord(JSON.stringify({...record,scope:'whole-site'}),point),/形式/)
  assert.throws(()=>parseFollowUpRecord(JSON.stringify({...record,format:'solar-site-precheck-review'}),point),/形式/)
  assert.equal(followUpPointKey(null),'')
  const zoning={zoning:{...notes.farmland,answer:'用途地域・設備用途の適用条件は相談中。設置可否は未確認。'}}
  assert.deepEqual(parseFollowUpRecord(JSON.stringify(createFollowUpRecord(point,zoning)),point),zoning)
})

test('invalid files cannot erase notes or import arbitrary topics and remote links',()=>{
  const record=createFollowUpRecord(point,notes)
  assert.throws(()=>parseFollowUpRecord('{',point),/JSON/)
  assert.throws(()=>parseFollowUpRecord(' '.repeat(65537),point),/64KB/)
  assert.throws(()=>parseFollowUpRecord(JSON.stringify({...record,notes:{unknown:notes.farmland}}),point),/確認項目/)
  const imported=parseFollowUpRecord(JSON.stringify({...record,notes:{farmland:{...notes.farmland,url:'javascript:alert(1)',decision:'approved'}}}),point)
  assert.equal(imported.farmland.url,undefined);assert.equal(imported.farmland.decision,undefined)
  assert.equal(imported.farmland.answer,notes.farmland.answer)
})

test('recorded answers need a real date and a response; unknown stays a valid workflow state',()=>{
  for(const patch of [{checkedOn:''},{answer:' '},{checkedOn:'2026-02-30'},{status:'approved'},{answer:'x'.repeat(4001)}])assert.throws(()=>createFollowUpRecord(point,{farmland:{...notes.farmland,...patch}}))
  assert.equal(createFollowUpRecord(point,{farmland:{status:'unreviewed',checkedOn:'',department:'',answer:''}}).notes.farmland.status,'unreviewed')
})

test('multibyte answers cannot produce a saved file larger than the restore limit',()=>{
  const many=Object.fromEntries(Object.keys(FOLLOW_UP_TOPICS).map(topic=>[topic,{...notes.farmland,answer:'あ'.repeat(4000)}]))
  assert.throws(()=>createFollowUpRecord(point,many),/64KB/)
  const supported=Object.fromEntries(Object.keys(FOLLOW_UP_TOPICS).map(topic=>[topic,{...notes.farmland,answer:'あ'.repeat(2000)}]))
  const saved=JSON.stringify(createFollowUpRecord(point,supported),null,2)
  assert.deepEqual(parseFollowUpRecord(saved,point),supported)
})
