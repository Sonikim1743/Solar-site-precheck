import {pointInspectionGroups} from '../utils/pointInspectionSummary.js'
import {PrecheckOverview,RegulatoryFollowUpTopic,RegulatoryFollowUpFiles} from './RegulatoryFollowUp.jsx'

function Match({item}){
  return <li><strong><i className="point-zone-swatch" style={{backgroundColor:item.color}} aria-hidden="true"/>{item.name}</strong>{item.subtitle&&<small>{item.subtitle}</small>}{item.note&&<small className="point-zone-short-note">原資料：{item.note}</small>}</li>
}
export default function PointInspectionSummary({result,children,notes={},onNotesChange}){
  const groups=pointInspectionGroups(result)
  return <div className="point-zone-quick-results">
    <PrecheckOverview groups={groups}/>
    <article className="point-zone-quick-card">
      <div className="point-zone-card-title"><h5>用途地域・設置可否</h5><span className="point-zone-badge is-unconfirmed">未確認</span></div>
      <p>正式な用途地域と計画設備の扱いを先に確認します。面積制限は対象用途・床面積等を照合し、敷地面積から推定しません。</p>
      <RegulatoryFollowUpTopic topic="zoning" result={result} notes={notes} onNotesChange={onNotesChange}/>
    </article>
    <article className="point-zone-quick-card">
      <div className="point-zone-card-title"><h5>農地・農振区分</h5><span className="point-zone-badge is-unconfirmed">未確認</span></div>
      <p>筆ごとの農地・青地・白地は未取得です。農業地域との重なりだけでは判断できません。農地を一律に除外しません。</p>
      <RegulatoryFollowUpTopic topic="farmland" result={result} notes={notes} onNotesChange={onNotesChange}/>
    </article>
    <h4>この地点に重なる区域</h4>
    {groups.map(group=><article className="point-zone-quick-card" key={group.id}>
      <div className="point-zone-card-title"><h5><i className="point-zone-swatch" style={{backgroundColor:group.color}} aria-hidden="true"/>{group.label}</h5><span className={`point-zone-badge is-${group.kind}`}>{group.statusLabel}</span></div>
      <p>{group.meaning}</p>
      {group.items.length>0&&<ul>{group.items.slice(0,3).map(item=><Match key={item.id} item={item}/>)}</ul>}
      {group.items.length>3&&<details><summary>ほか{group.items.length-3}件</summary><ul>{group.items.slice(3).map(item=><Match key={item.id} item={item}/>)}</ul></details>}
      <p className="point-zone-next">次に：{group.next}</p>
      <RegulatoryFollowUpTopic topic={group.id} result={result} notes={notes} onNotesChange={onNotesChange}/>
      {group.id==='agriculture-region'&&!result.includeHistorical&&<small>農用地区域（古い資料）はOFF</small>}
    </article>)}
    <RegulatoryFollowUpFiles result={result} notes={notes} onNotesChange={onNotesChange}/>
    <p className="point-zone-common-note">参考資料です。未検出・資料なしは安全の証明ではありません。重なりだけで開発不可とは決まりません。</p>
    <details className="point-zone-all-details"><summary>出典・基準日・詳しい内容</summary>{children}</details>
  </div>
}
