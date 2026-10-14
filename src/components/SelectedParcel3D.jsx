import { useEffect, useMemo, useRef, useState } from 'react'
import { measureParcelReview } from '../utils/parcelReview.js'
import { terrainGeometryKey } from '../utils/terrainArea.js'
import { featureInteriorPoint } from '../services/parcelGeometry.js'
import { analyzeTerrainArea } from '../services/terrainArea.js'
import { TerrainArea3D } from './TerrainAreaFigures.jsx'
import { isMapParcel, MAP_PARCEL_NOTICE } from '../utils/mapParcelSelection.js'

import {selectedParcelUnionReview} from '../utils/selectedParcelReview.js'
export {selectedParcelUnionReview} from '../utils/selectedParcelReview.js'

export default function SelectedParcel3D({ review, referenceCount = 0, request = 0, analyze = analyzeTerrainArea, onAcquired }) {
  const unionReview = useMemo(()=>selectedParcelUnionReview(review),[review])
  const metrics = useMemo(()=>measureParcelReview(unionReview),[unionReview])
  const geometry = metrics.geometry, key = geometry ? terrainGeometryKey(geometry) : ''
  const count = (unionReview?.parcels || []).filter(p=>p.role==='target').length
  const mapCount = (unionReview?.parcels || []).filter(p=>p.role==='target'&&isMapParcel(p)).length
  const position = useMemo(()=>geometry ? featureInteriorPoint({geometry}) : null,[key])
  const [state,setState]=useState({status:'idle',result:null,error:'',progress:null}),job=useRef({id:0,controller:null}),latest=useRef(key)
  latest.current=key
  useEffect(()=>{job.current.id++;job.current.controller?.abort();setState({status:'idle',result:null,error:'',progress:null});return()=>{job.current.id++;job.current.controller?.abort()}},[key])
  async function show(){
    if(!geometry)return
    job.current.controller?.abort();const controller=new AbortController(),id=++job.current.id;job.current.controller=controller
    const current=()=>job.current.id===id&&latest.current===key&&!controller.signal.aborted
    setState(s=>({...s,status:'loading',error:'',progress:null}))
    try{const result=await analyze(geometry,{signal:controller.signal,onProgress:progress=>current()&&setState(s=>({...s,progress}))});if(!current())return;if(result.geometryKey!==key)throw Error('筆の形状と地形結果が一致しません。');setState({status:result.summary.coveragePercent<100||result.summary.slopeCoveragePercent<100?'review':'success',result,error:'',progress:null});onAcquired?.(result)}
    catch(e){if(current())setState(s=>({...s,status:'error',error:e.message||'地形を取得できません。前回結果を保持しています。',progress:null}))}
  }
  function cancel(){job.current.id++;job.current.controller?.abort();setState(s=>({...s,status:s.result?'success':'cancelled',progress:null,error:'中止しました。前回の同じ筆の結果は保持しています。'}))}
  useEffect(()=>{if(request&&key){document.querySelector('.selected-parcel-3d')?.scrollIntoView({behavior:'smooth',block:'start'});show()}},[request])
  if(!count&&!referenceCount)return null
  return <section className="simple-batch selected-parcel-3d terrain-area-panel" aria-label="選択した筆の形で3D"><h3>{mapCount?'選択した参考領域で3D':'選択した筆の形で3D'}</h3><p>{mapCount?'適用済みの参考領域':'確認済みの対象'} {count}{mapCount?'区域':'筆'}{referenceCount>0&&` / 全筆境界未確認の参考 ${referenceCount}筆（計算外）`}。対象の合併形状をそのまま使い、指定範囲や除外図形で切り取らず、複数領域・穴・凹形を保持します。</p>{mapCount>0&&<p>{MAP_PARCEL_NOTICE}</p>}{!key&&<p role="status">「地番選択」で同じ表示境界を選び直し、黄色のプレビューを確認して「選択完了」で参考領域に適用してください。原本全筆は未確認ですが、表示された形状でシミュレーションできます。</p>}<div className="simple-batch-actions"><button type="button" disabled={!key||state.status==='loading'} onClick={show}>{count?`${mapCount?'参考領域':'確認済み'}${count}${mapCount?'区域':'筆'}を3Dで見る`:'地図の境界を参考領域として選択してください'}</button>{state.status==='loading'&&<button type="button" onClick={cancel}>筆の3D取得を中止</button>}</div>{state.status==='loading'&&<p role="status">同じ筆形状のDEMを取得中…</p>}{state.error&&<p role="alert">{state.error}</p>}{state.status==='review'&&<p role="status">一部未取得です。欠測を0mに置き換えず、取得範囲のみ表示します。</p>}{state.result&&<div data-selected-parcel-geometry-key={state.result.geometryKey}><TerrainArea3D analysis={state.result} position={position} interactive/></div>}</section>
}
