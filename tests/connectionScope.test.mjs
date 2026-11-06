import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { exampleReviewRecord, parseReviewRecord } from '../src/utils/reviewRecord.js'
import { gridReviewNote } from '../src/services/gridReview.js'

test('fixed app, report, help and generated-memo copy no longer asks for connection approval checks', async () => {
  const paths = ['src/App.jsx', 'src/components/CandidateWorkflow.jsx', 'src/components/ReportPreview.jsx', 'src/components/ReviewRecordsPanel.jsx', 'src/components/UseCasesGuide.jsx', 'src/components/PowerGridPage.jsx', 'src/components/GridEquipmentDetails.jsx', 'src/components/GridCapacityExplorer.jsx', 'src/components/PowerSupportPanel.jsx', 'src/components/TerrainLayoutPreview.jsx', 'src/utils/terrainLayoutReport.js', 'src/services/gridReview.js']
  for (const path of paths) {
    const source = await readFile(new URL('../' + path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /接続可否|接続可能|接続承認|接続未確認|接続点.*確認|系統接続|連系・|事前相談/, path)
  }
  assert.doesNotMatch(exampleReviewRecord('1.28.5').candidate.fieldMemo, /系統接続/)
})

test('public equipment values remain in new notes without a prescribed connection-consultation step', () => {
  const note = gridReviewNote({ official: { name: '合成設備', no: 'test', availableCapacityMw: 0, updatedAt: '2026-11-06' } })
  assert.match(note, /公表空容量: 0 MW/)
  assert.match(note, /資料更新日: 2026-11-06/)
  assert.doesNotMatch(note, /接続|電力会社へ確認/)
})

test('user-authored old notes remain intact when records are reopened', () => {
  const text = '以前に記録した接続可否の相談メモ（合成テスト）'
  const original = exampleReviewRecord('1.28.5')
  const record = { ...original, candidate: { ...original.candidate, fieldMemo: text } }
  assert.equal(parseReviewRecord(JSON.stringify(record)).candidate.fieldMemo, text)
})
