import {pointInspectionGroups} from '../utils/pointInspectionSummary.js'

function Match({item}){
  return <li><strong><i className="point-zone-swatch" style={{backgroundColor:item.color}} aria-hidden="true"/>{item.name}</strong>{item.subtitle&&<small>{item.subtitle}</small>}{item.note&&<small className="point-zone-short-note">原資料：{item.note}</small>}</li>
}
export default function PointInspectionSummary({result,children}){
  return <div className="point-zone-quick-results">
    <h4>この地点に重なる区域</h4>
    {pointInspectionGroups(result).map(group=><article className="point-zone-quick-card" key={group.id}>
      <div className="point-zone-card-title"><h5><i className="point-zone-swatch" style={{backgroundColor:group.color}} aria-hidden="true"/>{group.label}</h5><span className={`point-zone-badge is-${group.kind}`}>{group.statusLabel}</span></div>
      <p>{group.meaning}</p>
      {group.items.length>0&&<ul>{group.items.slice(0,3).map(item=><Match key={item.id} item={item}/>)}</ul>}
      {group.items.length>3&&<details><summary>ほか{group.items.length-3}件</summary><ul>{group.items.slice(3).map(item=><Match key={item.id} item={item}/>)}</ul></details>}
      <p className="point-zone-next">次に：{group.next}</p>
      {group.id==='agriculture-region'&&!result.includeHistorical&&<small>農用地区域（古い資料）はOFF</small>}
    </article>)}
    <p className="point-zone-common-note">参考資料です。未検出・資料なしは安全の証明ではありません。重なりだけで開発不可とは決まりません。</p>
    <details className="point-zone-all-details"><summary>出典・基準日・詳しい内容</summary>{children}</details>
  </div>
}
