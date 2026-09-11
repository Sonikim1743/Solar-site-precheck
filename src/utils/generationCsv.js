import { generationAtPosition } from '../../shared/generation.js'

export function generationCsvRows(generation, position) {
  if (!generationAtPosition(generation, position)) return [['PVGIS参考発電量', '未計算']]
  const { inputs, monthly } = generation
  return [
    ['PVGIS参考年間発電量(kWh)', generation.annualKwh],
    ['PVGISパネル容量(DC kWp)', inputs.peakpower],
    ['PVGIS傾斜角(°)', inputs.angle],
    ['PVGIS方位角(°・南0/東-90/西90)', inputs.aspect],
    ['PVGISシステム損失(%)', inputs.loss],
    ['PVGIS出典', generation.source],
    ['PVGIS対象期間', generation.period || ''],
    ['PVGIS取得日時(UTC)', generation.fetchedAt],
    ['PVGIS出典URL', generation.sourceUrl || generation.docsUrl || ''],
    ...monthly.map(row => [`${row.month}月 PVGIS参考発電量(kWh)`, row.kwh]),
    ['PVGIS未反映条件', 'アプリの地平線・樹木・建物・NEDO積雪係数・個別PCS制約・系統出力制御は未反映'],
  ]
}
