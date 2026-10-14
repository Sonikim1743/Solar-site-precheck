import test from 'node:test'
import assert from 'node:assert/strict'
import {terrainReviewSynthetic} from './fixtures/terrainReviewSynthetic.mjs'
import {buildTerrainLayout} from '../src/utils/terrainLayout.js'
import {buildTerrainSlopeComparison,terrainLayoutAnalysisKey} from '../src/utils/terrainLayoutComparison.js'
import {terrainReportLayouts,terrainLayoutReportRows} from '../src/utils/terrainLayoutReport.js'
import {terrainReportTitle} from '../src/utils/terrainReportTitle.js'
test('controlled comparison changes only strict terrain slope and retains tilt, geometry and other applied conditions',()=>{
 const {terrainArea:a}=terrainReviewSynthetic(),c=buildTerrainSlopeComparison(a,{slopeLimitDeg:20,tiltDeg:10,azimuthDeg:180})
 const [x,y]=c.layouts
 assert.deepEqual({...x.options,slopeLimitDeg:20},y.options)
 assert.equal(x.options.tiltDeg,10);assert.equal(y.options.tiltDeg,10)
 assert.ok(y.moduleCount>x.moduleCount)
 assert.ok(Math.abs(x.dcKw-x.moduleCount*.72)<1e-8)
 assert.ok(Math.abs(y.dcKw-y.moduleCount*.72)<1e-8)
})
test('report uses completed pool and manual exclusions while pending condition edits cannot change quantities or fence',()=>{
 const {terrainArea:a}=terrainReviewSynthetic(),raw=buildTerrainLayout(a,{slopeLimitDeg:20}),pool={...raw,analysisKey:terrainLayoutAnalysisKey(a),analysisReference:a}
 const preview={layout:pool,options:{...pool.options,rowGapM:20,tiltDeg:50},disabledRackIds:[pool.racks[0].id],fence:true}
 const report=terrainReportLayouts(a,preview)
 assert.equal(report.current.rackCount,pool.rackCount-1)
 assert.equal(report.current.options.rowGapM,pool.options.rowGapM)
 assert.ok(report.fence.rails.length)
 assert.ok(terrainLayoutReportRows(report.current).some(([label,value])=>label==='AC参考容量'&&value.startsWith('約 ')&&value.includes('〜')))
 assert.equal(terrainReportLayouts(a,{...preview,disabledRackIds:pool.racks.map(r=>r.id)}).fence,null)
 assert.equal(terrainReportLayouts({...a},preview).current,null)
})
test('output title prefers explicit input and falls back to place without altering the source strings',()=>{
 assert.equal(terrainReportTitle({siteName:' 合成発電所 ',placeLabel:'地名'}),'合成発電所')
 assert.equal(terrainReportTitle({siteName:' \t ',placeLabel:' 地名 '}),'地名')
 assert.equal(terrainReportTitle({position:{lat:35,lon:135}}),'候補地 · N35.000000 / E135.000000')
})
