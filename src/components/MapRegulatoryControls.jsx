import { HAZARD_LAYERS, HAZARD_SOURCE, HAZARD_TERMS, hazardStatus, hazardRegionMessage, REGULATORY_UNSUPPORTED, HIROSHIMA_SOIL_METADATA } from '../utils/regulatoryLayers.js'
import { REGULATORY_REFERENCE_SOURCES, REFERENCE_UNKNOWN, referenceYears } from '../utils/regulatoryRegistry.js'
import './regulatory-layers.css'

export function RegulatoryToggle({enabled,onToggle}) {
  return <button type="button" className="map-base-toggle map-regulatory-toggle" aria-label="除外検討区域" aria-pressed={enabled} onClick={onToggle}>除外検討区域 {enabled?'ON':'OFF'}</button>
}

export function UnsupportedRegulatoryInfo({kind}) {
  const info=REGULATORY_UNSUPPORTED[kind]
  return <details className="regulatory-unavailable"><summary>{info.title} <span>未対応・公式情報</span></summary><p>{info.message}</p><p>{info.notes}</p><p>{info.scopeNote} 地図やPDFを読み取って図形を補っていません。</p><ul>{info.links.map(([name,url])=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{name} ↗</a></li>)}</ul></details>
}

export function ReferenceRegulatoryInfo({includeHistorical=false,onHistoricalChange,referenceStatus={}}) {
  return <details className="regulatory-reference-info"><summary>文化財・農業地域 · 対応範囲と原資料年</summary>
    <p>岡山の文化財・農業地域、広島・山口の古い農業地域を参考表示。農業地域・農業振興地域・農用地区域は区別します。</p>
    <p>ズーム12以上。紫：文化財、茶：農業地域、破線：古い参考資料。表示範囲外・未取得の場所もあります。</p>
    <p role="status">{referenceStatus.message||'参考図形の表示範囲は未確認です。'}</p>
    {onHistoricalChange&&<button type="button" className="secondary-button" aria-pressed={includeHistorical} onClick={()=>onHistoricalChange(!includeHistorical)}>古い農用地区域も表示 {includeHistorical?'ON':'OFF'}</button>}
    <p>農用地区域は広島2002年・山口2005年等の古い資料で既定OFF。現在の確定境界ではありません。</p>
    {REGULATORY_REFERENCE_SOURCES.map(source=><details key={source.id}><summary>{source.label}</summary><p>原本 {source.sourceRecordCount.toLocaleString('ja-JP')}件。{referenceYears(source)}{source.fileEdition?`／ファイル版 ${source.fileEdition}年`:''}</p><p>{source.featureDate}{source.exportDate?`／ZIP出力日 ${source.exportDate}`:''}</p><p>測地系：{source.sourceCrs.epsg?'JGD2000（EPSG:4612）':'原本未記載・未確定'}。{source.displayMethod}</p><p>{source.license}／出典：{source.attribution}。参考表示用に図形分割・文字CP932復号。原本縮尺・現行境界・位置精度は未確認。</p><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">正規配布・利用条件 ↗</a></details>)}
    <p className="hazard-caution">{REFERENCE_UNKNOWN} 法定境界・取引の証拠ではありません。必要な現行情報は行政へ確認してください。</p>
  </details>
}

export default function MapRegulatoryControls({settings,onChange,statuses={},region={},onRetry,referenceStatus={},includeHistorical=false,onHistoricalChange}) {
  return <details className="regulatory-controls"><summary>除外検討区域 · 凡例・資料状況</summary>
    <p>対応済みの公開資料を一括表示。文化財・農地など未対応あり。</p>
    <p className="hazard-caution">白色・透明・未提供は安全の根拠になりません。視覚的な参考表示であり、自動除外・法的判断には使いません。</p>
    <p>{settings.enabled?hazardRegionMessage(region):'OFF（未照会）'}</p>
    <p>土砂は商用再利用を確認した42都道府県のうち地図中心の県のみ。神奈川・京都・和歌山・鳥取・長崎は個別条件未確認のため未対応。全国表示では洪水のみ、土砂はズーム8以上。</p>
    {region.prefecture==='34'&&<p>広島土砂：原資料 {HIROSHIMA_SOIL_METADATA.sourceDate}、A33共通基準 {HIROSHIMA_SOIL_METADATA.a33Date}、GSI反映 {HIROSHIMA_SOIL_METADATA.gsiDate}。CC BY／出典：{HIROSHIMA_SOIL_METADATA.attribution}。概略参考図・不完全性あり。法定境界・取引の証拠ではありません。</p>}
    <label>透明度 <input aria-label="除外検討区域の透明度" type="range" min="10" max="100" step="5" value={Math.round(settings.opacity*100)} onChange={e=>onChange({opacity:Number(e.target.value)/100})}/><output>{Math.round(settings.opacity*100)}%</output></label>
    {HAZARD_LAYERS.map(layer=><details className="hazard-layer-choice" key={layer.id}><summary>{layer.name} · 凡例</summary>
      <p role="status">{!settings.enabled?'OFF（未照会）':layer.soil&&region.state!=='ready'?hazardRegionMessage(region):(statuses[layer.id]||hazardStatus()).message}</p>
      <img src={layer.legend} alt={`${layer.name}の公式凡例`} loading="lazy"/>
      <p>{layer.date}</p><p>{layer.coverage}</p>
      <p>出典：ハザードマップポータルサイト／国交省・都道府県。土砂は国土数値情報（令和7年度土砂災害警戒区域）を基にGSIが加工。透過合成・拡大表示。確認 {layer.checkedAt}</p>
      <a href={layer.source} target="_blank" rel="noopener noreferrer">原典・利用条件 ↗</a>
    </details>)}
    {settings.enabled&&<button type="button" className="secondary-button" onClick={onRetry}>表示範囲を再試行</button>}
    <p><a href={HAZARD_SOURCE} target="_blank" rel="noopener noreferrer">公式の配信・掲載範囲 ↗</a> / <a href={HAZARD_TERMS} target="_blank" rel="noopener noreferrer">利用条件 ↗</a></p>
    <ReferenceRegulatoryInfo referenceStatus={referenceStatus} includeHistorical={includeHistorical} onHistoricalChange={onHistoricalChange}/>
    {Object.keys(REGULATORY_UNSUPPORTED).map(kind=><UnsupportedRegulatoryInfo key={kind} kind={kind}/>)}
  </details>
}

export function MapHazardSummary({settings,statuses={},region={},referenceStatus={}}) {
  if(!settings.enabled)return null
  const status=hazardStatus(HAZARD_LAYERS.filter(l=>!l.soil||region.state==='ready').flatMap(l=>{
    const s=statuses[l.id];return s?Object.keys(s).filter(k=>['ready','loading','unavailable','error'].includes(k)&&s[k]>0):[]
  }))
  return <div className="regulatory-layer-summary" aria-label="除外検討区域の状態"><strong>公開資料を表示・未対応あり</strong><span>{status.message}</span><span>{hazardRegionMessage(region)}</span><span>{referenceStatus.message||'文化財・農業地域：表示範囲は未確認'}</span><small>文化財は岡山、農業地域は岡山・広島・山口の参考資料。原資料年・精度・未対応範囲を確認。白色・透明・未提供・失敗は安全を意味しません。PDF・DXF出力対象外。</small></div>
}
