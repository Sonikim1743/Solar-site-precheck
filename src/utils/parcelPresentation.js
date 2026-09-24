export function geonexParcelUrl(info) {
  const address = [info?.municipality, info?.area, info?.number].filter(Boolean).join(' ').trim()
  return info?.municipality && info?.number && !/^筆 /.test(info.number)
    ? `https://geonex-maps.com/p/${encodeURIComponent(address)}`
    : 'https://geonex-maps.com/'
}

export function parcelReviewCsvRows(review, metrics) {
  if (!review || (!review.parcels.length && !review.boundary && !review.exclusions.length)) return []
  return [
    ['範囲面積の扱い', '地図形状の概算。登記地積・設置可能容量を示しません。参考筆は面積に含みません。'],
    ['対象筆数', metrics.targetCount], ['参考筆数', metrics.referenceCount],
    ['対象筆の合計面積(m²)', Math.round(metrics.targetAreaM2)],
    ['検討範囲面積(m²)', Math.round(metrics.reviewAreaM2)],
    ['検討範囲内の除外面積(m²)', Math.round(metrics.excludedAreaM2)],
    ['除外後の検討面積(m²)', Math.round(metrics.usableAreaM2)],
    ['範囲の指定', review.boundary ? '手描き範囲（対象筆があれば共通部分）' : '対象筆の合計'],
    ...review.parcels.flatMap((entry, index) => [
      [`筆${index + 1} 区分`, entry.role === 'target' ? '対象' : '参考'],
      [`筆${index + 1} 所在・地番`, entry.info.label],
      [`筆${index + 1} 元ファイル`, entry.source.fileName],
      [`筆${index + 1} 取込日時`, entry.source.importedAt],
    ]),
  ]
}
