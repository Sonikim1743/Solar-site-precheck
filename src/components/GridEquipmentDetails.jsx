import { capacityValueLabel, capacityValueStatusLabel, summarizeGridFlowDirection } from '../services/gridCapacity.js'

export default function GridEquipmentDetails({ record, compact = false }) {
  if (!record) return null
  const flow = summarizeGridFlowDirection(record)
  const rows = [
    ['設備番号', record.no || '記載なし'],
    ['電圧', Number.isFinite(record.voltageKv) ? `${record.voltageKv} kV` : '記載なし'],
    ['空容量（当該設備）', capacityValueStatusLabel(record.availableCapacityMw)],
    ['空容量（上位系統考慮）', capacityValueStatusLabel(record.upstreamAvailableCapacityMw, { upstream: true })],
    ['設備容量', capacityValueLabel(record.installedCapacityMw)],
    ['運用容量', capacityValueLabel(record.operatingCapacityMw)],
    ['容量制約要因', record.capacityConstraint || '記載なし'],
    ['公表の潮流方向（正方向）', flow.label],
    ['予想潮流', capacityValueLabel(record.expectedFlowMw)],
    ['予想潮流の向き', flow.expectedLabel || '記載なし'],
    ['N-1電制適用可否', record.nMinusOne || '記載なし'],
    ['平常時出力制御の可能性', record.outputControlPossibility || '記載なし'],
    ['制御対象（当該設備）', record.controlledEquipment || '記載なし'],
    ['制御対象（上位系）', record.controlledUpstream || '記載なし'],
  ]
  return <section className="grid-equipment-detail">
    <h4>{record.name}</h4>
    <dl>{(compact ? rows.slice(0, 4) : rows).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {compact && <details><summary>潮流・出力制御などの公表条件</summary><dl>{rows.slice(4).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
    <p className="power-grid-note">{flow.reversed ? '予想潮流が負値のため、公表の正方向と逆向きです。' : ''} 空容量の「記載なし」は0 MWではありません。空容量だけで接続可否は判定できません。</p>
    {record.notes && <p>備考：{record.notes}</p>}
    <small>{record.areaLabel} / {record.updatedAt || '更新日未記載'}</small>
    <div>{record.pdfUrl && <a href={record.pdfUrl} target="_blank" rel="noreferrer">出典PDF</a>}{record.mappingUrl && <> · <a href={record.mappingUrl} target="_blank" rel="noreferrer">系統図</a></>}</div>
  </section>
}
