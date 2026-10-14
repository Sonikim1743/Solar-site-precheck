import test from 'node:test'
import assert from 'node:assert/strict'
import {selectedParcelUnionReview} from '../src/utils/selectedParcelReview.js'
import {MAP_PARCEL_SOURCE} from '../src/utils/mapParcelSelection.js'
test('map-reference simulation uses exactly its selected targets while preserving other review work',()=>{
 const map={id:'map-a',role:'target',source:{fileName:MAP_PARCEL_SOURCE}},other={id:'original-b',role:'target',source:{fileName:'原本資料'}},reference={id:'ref-c',role:'reference',source:{fileName:MAP_PARCEL_SOURCE}}
 const r={version:1,parcels:[map,other,reference],boundary:{geometry:'kept'},exclusions:[{id:'keep'}]},before=structuredClone(r),scope=selectedParcelUnionReview(r)
 assert.deepEqual(scope.parcels,[map]);assert.equal(scope.boundary,null);assert.deepEqual(scope.exclusions,[]);assert.deepEqual(r,before)
})
test('original/imported parcel-only scope keeps the existing all-target behavior',()=>{
 const r={version:1,parcels:[{role:'target',source:{fileName:'原本'}}],boundary:{},exclusions:[{}]},scope=selectedParcelUnionReview(r)
 assert.equal(scope.parcels,r.parcels);assert.equal(scope.boundary,null);assert.deepEqual(scope.exclusions,[]);assert.equal(r.exclusions.length,1)
})
