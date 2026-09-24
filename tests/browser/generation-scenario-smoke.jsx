import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import GenerationPanel from '../../src/components/GenerationPanel.jsx'
import ReportPreview from '../../src/components/ReportPreview.jsx'
import { thirdMeshCode } from '../../src/services/nedo.js'
import '../../src/styles.css'
import '../../src/components/power-grid-page.css'
import '../../src/workspace.css'

// Public educational coordinates and synthetic values only. No saved candidate is read.
const position = { lat: 34.65, lon: 133.9 }
const baseline = {
  inputs: { ...position, peakpower: 50, loss: 14, angle: 20, aspect: 0 },
  annualKwh: 60000,
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, kwh: 5000 })),
  source: '画面検証用の合成値（PVGISの取得結果ではありません）',
  sourceUrl: 'https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en',
  period: '2005–2023',
  fetchedAt: '2026-09-11T00:00:00.000Z',
}
const fixture = new URLSearchParams(location.search).get('sources') || 'ready'
const withReport = new URLSearchParams(location.search).get('report') === '1'
const snowStation = fixture === 'missing' ? null : {
  id: thirdMeshCode(fixture === 'mismatch' ? 35 : position.lat, position.lon),
  mode: 'nedo-web', verified: true, validationVersion: 2,
  snow10cm: { monthly: [.2, .2, 0, 0, 0, 0, 0, 0, 0, 0, 0, .2] },
}
const terrain = fixture === 'missing' ? null : {
  position: { ...position, ...(fixture === 'mismatch' ? { lat: 35 } : {}) },
  samples: Array.from({ length: 8 }, (_, i) => ({
    bearing: i * 45, terrainAngle: i + 1, angle: i + 16,
    missing: fixture === 'partial' && i === 3,
    profile: [{ distance: 1000, terrainAngle: i + 1, angle: i + 16, missing: false }],
  })),
}

function Harness() {
  const [result, setResult] = useState(baseline)
  const [sourceRequest, setSourceRequest] = useState('')
  const [sourcesAvailable, setSourcesAvailable] = useState(true)
  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: '16px 12px 32px' }}>
    <header className="no-print">
      <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>発電量の試算比較 — 画面検証</h1>
      <p style={{ margin: '0 0 12px', lineHeight: 1.7, fontSize: 13 }}>
        公開の参照座標・合成データのみ。実施設の実績・実際のPVGIS/NEDO取得結果ではありません。
        基本60,000 kWh/年、各月5,000 kWh。冬3か月の仮の積雪出現率20%。
      </p>
    </header>
    <section className="solar-generation" aria-label="参考発電量の画面検証">
      <GenerationPanel position={position} result={result} onChange={setResult}
        expanded terrain={sourcesAvailable ? terrain : null} snowStation={sourcesAvailable ? snowStation : null} onScenarioSources={setSourceRequest} />
    </section>
    {fixture === 'dynamic' && <button type="button" className="no-print" onClick={() => setSourcesAvailable(false)}>検証用：参照資料を外す</button>}
    {withReport && <ReportPreview report={{
      appVersion: '1.26', buildDate: '2026-09-11', siteName: '公開参照座標・画面検証用の合成データ',
      position, obstructionHeight: 20, snowBase: 1, generation: result,
      memo: 'このレポートは画面検証用です。実施設の実績・実際のAPI取得結果ではありません。',
    }} />}
    <output data-testid="source-request">{sourceRequest}</output>
    <pre hidden data-testid="qa-state">{JSON.stringify(result)}</pre>
    <pre hidden data-testid="qa-baseline">{JSON.stringify(baseline)}</pre>
  </main>
}

createRoot(document.getElementById('root')).render(<Harness />)
