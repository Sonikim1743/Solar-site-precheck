import { generationAtPosition } from '../../shared/generation.js'

export function generationCsvRows(generation, position) {
  if (!generationAtPosition(generation, position)) return [['PVGIS参考発電量', '未計算']]
  const { inputs, monthly, scenario } = generation
  return [
    ['PVGIS参考年間発電量(kWh)', generation.annualKwh],
    ['PVGIS基準値の地平線', 'PVGIS標準の地形地平線を使用'],
    ['PVGISパネル容量(DC kWp)', inputs.peakpower],
    ['PVGIS傾斜角(°)', inputs.angle],
    ['PVGIS方位角(°・南0/東-90/西90)', inputs.aspect],
    ['PVGISシステム損失(%)', inputs.loss],
    ['PVGIS出典', generation.source],
    ['PVGIS対象期間', generation.period || ''],
    ['PVGIS取得日時(UTC)', generation.fetchedAt],
    ['PVGIS出典URL', generation.sourceUrl || generation.docsUrl || ''],
    ...monthly.map(row => [`${row.month}月 PVGIS参考発電量(kWh)`, row.kwh]),
    ['PVGIS基準値の未反映条件', 'アプリの個別地平線・近接影・今回の積雪仮定・個別PCS制約・系統出力制御は未反映'],
    ...(scenario ? [
      ['試験比較の年間発電量(kWh)', scenario.annualKwh],
      ['試験比較の基準との差(kWh)', scenario.differenceKwh],
      ['試験比較の基準との差(%)', scenario.differencePercent ?? '算出不可（基準値0）'],
      ['試験比較の計算日時(UTC)', scenario.calculatedAt],
      ...scenario.monthly.map(row => [`${row.month}月 試験比較の発電量(kWh)`, row.kwh]),
      ...(scenario.snow ? [
        ['試験比較の積雪メッシュ', scenario.snow.mesh],
        ['試験比較の積雪出典', scenario.snow.source],
        ['試験比較の積雪影響係数(%)', scenario.snow.weight],
        ...scenario.snow.rates.map((rate, index) => [`${index + 1}月 試験比較の積雪出現率`, rate]),
        ['試験比較の積雪仮定', '月別損失率＝積雪出現率×利用者が設定した影響係数÷100。パネル被覆率の実測ではなく仮の損失モデル。既存の積雪補正基準値やシステム損失を重ねて乗算しません'],
      ] : [['試験比較の積雪仮定', '適用なし']]),
      ...(scenario.terrain ? [
        ['試験比較の地平線', '入力した地平線でPVGIS標準地形地平線を置換。上乗せではなく、基準より増減する場合があります'],
        ['試験比較の地平線角(°・北から時計回り)', scenario.terrain.inputs.userhorizon.join(',')],
        ['試験比較の地平線計算出典', scenario.terrain.source],
        ['試験比較の地平線計算期間', scenario.terrain.period || ''],
        ['試験比較の地平線計算取得日時(UTC)', scenario.terrain.fetchedAt],
        ['試験比較の地平線計算URL', scenario.terrain.sourceUrl],
        ['試験比較の地平線の限界', '入力地平線の範囲・精度に依存し、分析範囲外の地形や近接する樹木・建物の影を正確に再現するものではありません'],
      ] : [['試験比較の地平線', '基準値と同じPVGIS標準地形地平線']]),
      ['試験比較の用途', '利用者の仮定を使う感度確認。実測・確定売電量・売上ではなく、個別PCS制約・系統出力制御は未反映'],
    ] : []),
  ]
}
