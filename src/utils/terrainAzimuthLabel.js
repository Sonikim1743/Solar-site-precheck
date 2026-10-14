const names=['北','北東','東','南東','南','南西','西','北西']
export function terrainAzimuthLabel(degrees) {
  if(!Number.isFinite(degrees))return '未設定'
  const d=((degrees%360)+360)%360
  return `${d.toLocaleString('ja-JP',{maximumFractionDigits:1})}°（${names[Math.round(d/45)%8]}向き）`
}
