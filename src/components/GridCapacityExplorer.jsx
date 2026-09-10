import { useMemo, useState } from 'react'
import { findPublishedGridConnections } from '../services/gridCapacity.js'
import GridEquipmentDetails from './GridEquipmentDetails.jsx'
import './grid-capacity-explorer.css'

const keyOf = (record) => `${record.areaId || ''}/${record.type}/${record.no}/${record.name}`
const normalize = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()

export default function GridCapacityExplorer({ dataset }) {
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const records = useMemo(() => [...(dataset?.lines || []), ...(dataset?.substations || [])], [dataset])
  const selected = records.find((record) => keyOf(record) === selectedKey)
  const found = query.trim() ? records.filter((record) => normalize(`${record.name} ${record.no} ${record.areaLabel}`).includes(normalize(query))) : []
  const connections = selected ? findPublishedGridConnections(selected, dataset) : []
  if (!dataset) return null
  return <section className="grid-capacity-explorer">
    <h4>公開DBから設備を調べる</h4>
    <p>地図の名称登録がない場合も検索できます。県境をまたぐ設備も広島・岡山・島根・鳥取の資料から確認します。</p>
    <label>設備名・設備番号・県名
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：東城線 / 広④L104 / 帝釈川" />
    </label>
    {query.trim() && <>
      <p role="status">{found.length}件{found.length > 30 ? '（先頭30件を表示・検索語を追加してください）' : ''}</p>
      <div className="grid-capacity-explorer__results">{found.slice(0, 30).map((record) => <button type="button" key={keyOf(record)} aria-pressed={selectedKey === keyOf(record)} onClick={() => setSelectedKey(keyOf(record))}>
        <strong>{record.name}</strong><span>{record.no} · {record.areaLabel} · {Number.isFinite(record.voltageKv) ? `${record.voltageKv} kV` : '電圧未記載'}</span>
      </button>)}</div>
    </>}
    {selected && <>
      <GridEquipmentDetails record={selected} />
      {connections.length > 0 && <div className="grid-capacity-explorer__connections">
        <h4>公表の潮流方向に記載された接続先</h4>
        <p>同じ端点名を持つ設備を表示します。距離による推定ではなく、系統の上位・下位を断定するものでもありません。</p>
        {connections.map(({ endpoint, lines, substations }) => <div key={endpoint}>
          <strong>{endpoint}</strong>
          {[...substations, ...lines].map((record) => <button type="button" key={keyOf(record)} onClick={() => setSelectedKey(keyOf(record))}>{record.name}（{record.no}）</button>)}
          {!lines.length && !substations.length && <p>読み込んだDBに同名の接続先詳細はありません。</p>}
        </div>)}
      </div>}
      <p className="power-grid-note">検索した設備の位置・候補地との接続関係は未確定です。検索結果を最寄り設備として地図やレポートに自動適用しません。</p>
    </>}
  </section>
}
