import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {REGULATORY_REFERENCE_SOURCES,selectReferenceFiles,referenceClue,createSiteReviewEvidence} from '../src/utils/regulatoryRegistry.js'
import {loadReferenceFeatures} from '../src/services/regulatoryReferences.js'
import {HIROSHIMA_SOIL_METADATA} from '../src/utils/regulatoryLayers.js'

const publicRoot=new URL('../public',import.meta.url)
const fileBytes=url=>fs.readFileSync(new URL('.'+url,publicRoot.href+'/'))
const bounds=[133.90,34.63,133.96,34.69]
const fetchAsset=async(url,{signal}={})=>{
  if(signal?.aborted)throw new DOMException('cancelled','AbortError')
  return new Response(fileBytes(url),{headers:{'content-type':'application/geo+json'}})
}

test('pinned real source records, actual years and unknown CRS remain distinct',()=>{
  const byId=Object.fromEntries(REGULATORY_REFERENCE_SOURCES.map(source=>[source.id,source]))
  assert.equal(byId['okayama-culture'].sourceRecordCount,22579)
  assert.equal(byId['okayama-agriculture'].sourceRecordCount,50)
  assert.equal(byId['okayama-culture'].sourceCrs.epsg,null)
  assert.equal(byId['okayama-agriculture'].sourceCrs.epsg,null)
  assert.equal(byId['a12-34-06'].sourceCrs.epsg,4612)
  assert.deepEqual(byId['a12-34-06'].sourceYears,{'2002':2832})
  assert.deepEqual(byId['a12-35-06'].sourceYears,{'2005':2689,'2012':1,'2013':1})
  assert.equal(byId['a12-34-06'].fileEdition,'2015')
  assert.equal(HIROSHIMA_SOIL_METADATA.sourceDate,'2025-07-24')
  assert.equal(HIROSHIMA_SOIL_METADATA.license,'CC BY')
})

test('every generated chunk is readable, immutable and has unique source-linked polygons',()=>{
  const ids=new Set()
  for(const source of REGULATORY_REFERENCE_SOURCES){
    let count=0
    for(const file of source.files){
      const raw=fileBytes(file.url)
      assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),file.sha256)
      assert.ok(raw.length<=8*1024*1024)
      const data=JSON.parse(raw)
      assert.equal(data.features.length,file.features)
      for(const feature of data.features){
        assert.equal(ids.has(feature.id),false);ids.add(feature.id)
        assert.equal(feature.geometry.type,'Polygon')
        assert.ok(feature.properties.sourceRecordId)
        for(const ring of feature.geometry.coordinates){assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring[ring.length-1])}
      }
      count+=data.features.length
    }
    assert.equal(count,source.featureCount)
  }
})

test('historic agricultural-use clues require a separate opt-in; region clues stay available',()=>{
  const japan=[120,20,155,50]
  const current=selectReferenceFiles(japan,{maxFiles:1000})
  assert.ok(current.files.some(item=>item.source.id==='a12-34-05'))
  assert.equal(current.files.some(item=>item.source.category==='agricultural-use'),false)
  assert.ok(selectReferenceFiles(japan,{includeHistorical:true,maxFiles:1000}).files.some(item=>item.source.id==='a12-34-06'))
  assert.equal(selectReferenceFiles(japan,{maxFiles:1}).partial,true)
})

test('actual local culture/agriculture assets load together within the public test viewport',async()=>{
  const result=await loadReferenceFeatures(bounds,{fetchImpl:fetchAsset})
  assert.equal(result.state,'ready');assert.ok(result.features.length>0)
  assert.ok(result.features.some(feature=>feature.properties.sourceDatasetId==='okayama-culture'))
  assert.ok(result.features.some(feature=>feature.properties.sourceDatasetId==='okayama-agriculture'))
  assert.match(result.message,/位置精度・現行境界は未確認/)
})

test('404 and malformed chunk responses remain errors, never a successful empty area',async()=>{
  const missing=await loadReferenceFeatures(bounds,{fetchImpl:async()=>new Response(null,{status:404})})
  assert.equal(missing.state,'error');assert.ok(missing.failures.length>0)
  const malformed=await loadReferenceFeatures(bounds,{fetchImpl:async()=>new Response('html',{headers:{'content-type':'text/html'}})})
  assert.equal(malformed.state,'error')
  const outside=await loadReferenceFeatures([120,20,121,21],{fetchImpl:fetchAsset})
  assert.equal(outside.state,'outside');assert.match(outside.message,/区域がないことを意味しません/)
})

test('OFF and view replacement abort requests without accepting stale geometry',async()=>{
  const controller=new AbortController();let called=0
  const promise=loadReferenceFeatures(bounds,{signal:controller.signal,fetchImpl:async(url,{signal})=>{
    called++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}))
  }})
  controller.abort();await assert.rejects(promise,{name:'AbortError'});assert.ok(called>0)
})

test('review export structure retains provenance and human decisions without inventing conclusions',()=>{
  const source=REGULATORY_REFERENCE_SOURCES.find(item=>item.id==='a12-34-06')
  const feature=JSON.parse(fileBytes(source.files[0].url)).features[0]
  const clue=referenceClue(feature,source)
  assert.equal(clue.source.sourceYear,'2002');assert.equal(clue.source.fileEdition,'2015')
  assert.equal(clue.source.coordinateReference.epsg,4612);assert.equal(clue.source.displayDatumConfirmed,false);assert.equal(clue.source.featureUpdatedAt,null)
  const record=createSiteReviewEvidence({candidateRange:{id:'synthetic'},clues:[clue],decision:'field-check',reason:'現行区域を行政で確認'})
  assert.equal(record.review.decision,'field-check');assert.equal(record.automaticLegalDecision,false);assert.equal(record.inferredDistributionRoute,false)
  assert.equal(record.clues[0].source.archiveSha256,source.archiveSha256)
  assert.throws(()=>createSiteReviewEvidence({decision:'approved'}))
})
