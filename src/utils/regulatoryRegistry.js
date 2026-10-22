import { REGULATORY_REGISTRY_DATA } from './regulatoryRegistryData.js'

export const REGULATORY_REFERENCE_SOURCES = REGULATORY_REGISTRY_DATA.datasets
export const REFERENCE_MIN_ZOOM = 12
export const REFERENCE_UNKNOWN = '空白・対象外・古い資料・取得失敗は規制なしや安全を意味しません。'
export const bboxIntersects = (a,b) => a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1]
export function selectReferenceFiles(bounds,{includeHistorical=false,maxFiles=32}={}) {
  const sources=REGULATORY_REFERENCE_SOURCES.filter(source=>source.category!=='agricultural-use'||!source.historic||includeHistorical)
  const selected=sources.flatMap(source=>source.files.filter(file=>bboxIntersects(file.bbox,bounds)).map(file=>({source,file})))
  return {files:selected.slice(0,maxFiles),partial:selected.length>maxFiles,available:selected.length}
}
export function referenceYears(source) {
  const years=Object.entries(source.sourceYears)
  return years.length?years.map(([year,count])=>`${year}年 ${count}件`).join('、'):'原資料年未確認'
}
export function referenceStyle(feature,opacity=.5) {
  const source=REGULATORY_REFERENCE_SOURCES.find(item=>item.id===feature.properties.sourceDatasetId)
  return {color:source?.color||'#704e21',weight:1.5,opacity:Math.min(1,opacity+.25),fillOpacity:opacity*.28,dashArray:source?.historic?'4 3':null,interactive:false}
}

// Future machine-readable review output. Every decision is explicitly human supplied.
// Evidence records are clues, never automatic legal verdicts or inferred grid routes.
export function createSiteReviewEvidence({candidateRange=null,gridEvidence=[],clues=[],terrainClues=[],accessClues=[],decision='unreviewed',reason='',unknowns=[],checkedAt=null}={}) {
  if(!['unreviewed','exclude','hold','field-check'].includes(decision))throw Error('Unknown review decision')
  return {schemaVersion:1,candidateRange,gridEvidence,clues,terrainClues,accessClues,review:{decision,reason,checkedAt},unknowns,automaticLegalDecision:false,inferredDistributionRoute:false}
}
export function referenceClue(feature,source) {
  return {type:source.category,geometry:feature.geometry,sourceFeatureId:feature.properties.sourceRecordId,source:{id:source.id,url:source.sourceUrl,license:source.license,archiveSha256:source.archiveSha256,sourceYear:feature.properties.sourceYear||null,fileEdition:source.fileEdition||null,featureDate:source.featureDate,featureUpdatedAt:null,exportDate:source.exportDate||null,coordinateReference:source.sourceCrs,displayDatumConfirmed:false,displayMethod:source.displayMethod},label:feature.properties.name,unknowns:[REFERENCE_UNKNOWN,source.displayMethod],review:{decision:'unreviewed',reason:''}}
}
