import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectionRowSummary,pointInspectionGroups} from '../src/utils/pointInspectionSummary.js'
test('missing, transparent, error, unknown and actual no-match stay distinct',()=>{
  for(const [state,label] of [['none','未検出'],['nodata','資料なし（透明）'],['unavailable','資料なし（404）'],['error','取得エラー'],['unconfirmed','未確認'],['outside','対象外・資料なし'],['painted','表示あり・種別未確認']])assert.equal(inspectionRowSummary([{state}]).statusLabel,label)
})
test('some matches never hide failures or incomplete coverage',()=>{
  const match={state:'matched',matches:[{id:'a'}]}
  assert.equal(inspectionRowSummary([match,{state:'error'}]).statusLabel,'重なり1件・一部エラー')
  assert.equal(inspectionRowSummary([match,{state:'partial'}]).statusLabel,'重なり1件・一部未確認')
})
test('quick groups distinguish agriculture from historical agricultural-use and preserve all matches',()=>{
  const result={references:[{source:{category:'culture',color:'#7b3fc6'},state:'matched',matches:[{id:'a',name:'合成遺跡',condition:'調査後一部消滅'}]},{source:{category:'agriculture-region'},state:'none',matches:[]},{source:{category:'agricultural-use'},state:'matched',matches:[{id:'b',name:'古い範囲'}]}],hazards:{mode:'stored',region:{state:'error'},datasets:[]}}
  const g=pointInspectionGroups(result)
  assert.equal(g[0].label,'文化財');assert.equal(g[0].statusLabel,'重なり1件');assert.equal(g[0].items[0].note,'調査後一部消滅')
  assert.equal(g[1].label,'農業地域');assert.equal(g[2].label,'農用地区域（古い資料）');assert.equal(g[3].statusLabel,'取得エラー')
  assert.equal(g[2].items[0].subtitle,'農用地区域（古い資料）')
})
