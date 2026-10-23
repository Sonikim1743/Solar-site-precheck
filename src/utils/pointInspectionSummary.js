const definitions={
  culture:{label:'文化財',color:'#7b3fc6',meaning:'遺跡などの参考範囲です。',next:'掘削・造成前に文化財窓口へ確認。'},
  'agriculture-region':{label:'農業地域',color:'#a66725',meaning:'土地利用計画の農業地域。農用地区域とは別です。',next:'市町村で現在の農用地区域・農地手続きを確認。'},
  'agricultural-use':{label:'農用地区域（古い資料）',color:'#a66725',meaning:'古い原資料の区域です。',next:'現在の指定と変更履歴を市町村へ確認。'},
  soil:{label:'土砂',color:'#d8a600',meaning:'土砂災害の警戒区域など。',next:'県の原図・担当窓口で現在の区域を確認。'},
  flood:{label:'洪水',color:'#d978a7',meaning:'川があふれた場合の浸水想定（想定最大規模）。',next:'想定条件・浸水深を自治体の原図で確認。'},
}

export function inspectionRowSummary(rows=[]){
  const count=rows.reduce((n,r)=>n+(r.matches?.length||0),0),states=rows.map(r=>r.state)
  if(states.includes('error'))return {kind:'error',count,statusLabel:count?`重なり${count}件・一部エラー`:'取得エラー'}
  if(states.includes('partial'))return {kind:'partial',count,statusLabel:count?`重なり${count}件・一部未確認`:'一部未確認'}
  if(states.some(s=>['unconfirmed','unreadable'].includes(s)))return {kind:'unconfirmed',count,statusLabel:count?`重なり${count}件・一部未確認`:'未確認'}
  if(count)return {kind:'matched',count,statusLabel:`重なり${count}件`}
  if(states.includes('painted'))return {kind:'unconfirmed',count,statusLabel:'表示あり・種別未確認'}
  if(states.includes('unavailable'))return {kind:'unavailable',count,statusLabel:'資料なし（404）'}
  if(states.includes('nodata'))return {kind:'unavailable',count,statusLabel:'資料なし（透明）'}
  if(states.includes('none'))return {kind:'none',count,statusLabel:'未検出'}
  if(states.includes('unsupported'))return {kind:'outside',count,statusLabel:'未対応'}
  return {kind:'outside',count,statusLabel:'対象外・資料なし'}
}

export function pointInspectionGroups(result){
  const groups=[]
  for(const category of ['culture','agriculture-region','agricultural-use']){
    const rows=result.references.filter(r=>r.source.category===category)
    if(category==='agricultural-use'&&!rows.length)continue
    const items=rows.flatMap(r=>r.matches.map(m=>({...m,color:r.source.color,subtitle:(m.kind&&!Object.keys(definitions).includes(m.kind)?m.kind:definitions[category].label)+(m.sourceYear?`（原資料${m.sourceYear}年）`:''),note:[m.condition,m.remark].filter(Boolean).join('／')})))
    groups.push({id:category,...definitions[category],...inspectionRowSummary(rows),items})
  }
  for(const category of ['soil','flood']){
    const h=result.hazards
    const rows=h.mode==='stored'?h.datasets.filter(r=>r.source.category===category):h.layers.filter(r=>category==='soil'?r.layer.soil:!r.layer.soil)
    const checked=rows.length?rows:[{state:h.region.state==='error'?'error':'unconfirmed'}]
    const items=rows.flatMap(r=>(r.matches||[]).map(m=>({...m,color:category==='soil'?([2,4].includes(m.properties?.A33_002)?'#d93025':'#e0ad00'):({1:'#f6dd68',2:'#f3a8ad',3:'#de70a8',4:'#a44fc2',5:'#7d48a6',6:'#573378'}[m.properties?.A31a_205]||'#777'),subtitle:category==='flood'?m.designation:[m.kind,m.designation?.replace('土砂災害特別警戒区域','特別警戒区域').replace('土砂災害警戒区域','警戒区域')].filter(Boolean).join('／'),note:m.boundary?'境界上・位置要確認':''})))
    groups.push({id:category,...definitions[category],...inspectionRowSummary(checked),items})
  }
  return groups
}
