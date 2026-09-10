import { matchPowerGridCapacity } from './gridCapacity.js'
export const gridDistance = value => Number.isFinite(value) ? (value >= 1000 ? (value / 1000).toFixed(1) + ' km' : Math.round(value) + ' m') : '距離未確認'
export const gridRecordKey = row => [row.areaId || row.areaLabel, row.type, row.no, row.name].join('|')
export function buildGridReview(data, dataset) {
  return [...(data?.lines || []).map(equipment => ({equipment,kind:'line'})), ...(data?.substations || []).map(equipment => ({equipment,kind:'substation'}))]
    .map(({equipment,kind}) => {
      const matches = matchPowerGridCapacity({lines:kind==='line'?[equipment]:[],substations:kind==='substation'?[equipment]:[]},dataset,Infinity)
      const candidates = kind==='line'?matches.lineMatches:matches.substationMatches
      const numbered = candidates.filter(item=>item.match.numberMatch)
      const confirmed = numbered.length===1?numbered[0]:null
      return {equipment,kind,candidates,capacity:confirmed?.capacity||null,match:confirmed?.match||null,status:confirmed?'number':candidates.length?'candidate':'unmatched'}
    }).sort((a,b)=>(a.equipment.distanceMeters??Infinity)-(b.equipment.distanceMeters??Infinity))
}
export function gridReviewNote({position,placeLabel,row,official,annualYield='',generation=null}) {
 const record=row?.capacity||official
 return ['系統・発電量 検討メモ',placeLabel||'候補地',position?'座標: '+position.lat+', '+position.lon:'座標未設定','記録日時: '+new Date().toISOString(),
 row?'地図設備: '+row.equipment.name+' / '+row.equipment.id:'地図設備: 未選択',
 row?'直線距離: '+gridDistance(row.equipment.distanceMeters)+'（接続経路ではありません）':'',
 '照合: '+(row?.capacity?'完全な設備番号が一意に一致':'地図と公式設備の対応は未確認'),
 record?'公式資料の設備: '+record.name+' / '+record.no:'公式設備: 未確認',
 record?'当該設備の公表空容量: '+(Number.isFinite(record.availableCapacityMw)?record.availableCapacityMw+' MW':'記載なし'):'',
 record?'上位系統考慮の公表空容量: '+(Number.isFinite(record.upstreamAvailableCapacityMw)?record.upstreamAvailableCapacityMw+' MW':'記載なし'):'',
 record?'資料更新日: '+(record.updatedAt||'未記載'):'',record?.pdfUrl||record?.sourceUrl||'',
 generation?'参考年間発電量: '+generation.annualKwh+' kWh / '+generation.source:'',
 generation?'発電条件: DC '+generation.inputs.peakpower+' kWp / 傾斜 '+generation.inputs.angle+'° / 南基準方位 '+generation.inputs.aspect+'° / 損失 '+generation.inputs.loss+'%':'',
 generation?'発電量データ期間: '+(generation.period||'出典で確認')+' / 取得 '+generation.fetchedAt:'',
 generation?'PVGIS標準地平線。樹木・建物の日影、NEDO積雪係数、個別PCS制約、系統出力制御は未反映。':'',
 generation?.sourceUrl||'',
 !generation&&annualYield?'Solar Pro年間発電量（手入力）: '+annualYield:'',
 '発電量と系統空容量は別の確認項目です。空容量から発電量・出力制御率・接続可否を推定していません。',
 '次の確認: 接続点、工事費・工期、出力制御条件を電力会社へ確認。'].filter(Boolean).join('\n')
}
