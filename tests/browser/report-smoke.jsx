import React from 'react'
import { createRoot } from 'react-dom/client'
import ReportPreview from '../../src/components/ReportPreview.jsx'
import '../../src/styles.css'

// Synthetic geometry only; no private site records or production API requests.
const line = { id: 'test-line', name: '表示検証用66kV線', voltageKv: 66, voltageLabel: '66kV', distanceMeters: 39000, direction: '北', bearing: 0, nearestPoint: { lat: 35.35, lon: 139 }, geometry: [{ lat: 35.35, lon: 138.9 }, { lat: 35.35, lon: 139.1 }] }
const substation = { id: 'test-sub', name: '表示検証用変電所', distanceMeters: 44000, direction: '南', bearing: 180, position: { lat: 34.604, lon: 139 } }
const report = {
  appVersion: '1.23', buildDate: '2026-08-31', siteName: '合成データ・表示確認', position: { lat: 35, lon: 139 }, obstructionHeight: 20, snowBase: 1,
  powerGrid: { position: { lat: 35, lon: 139 }, radiusMeters: 50000, lines: [line], substations: [substation],
    summary: { nearestLine: line, nearestPreferredLine: line, nearestSubstation: substation },
    search: { targetVoltagesKv: [66, 77], foundPreferredLine: true, attemptedRadiiMeters: [5000, 10000, 20000, 50000] },
  },
}
createRoot(document.getElementById('root')).render(<><h1>表示検証（合成データ）</h1><ReportPreview report={report} /></>)
