export function snowRateLevel(rate) {
  if (!Number.isFinite(rate)) return 'none'
  if (rate >= 0.5) return 'alert'
  if (rate >= 0.01) return 'notice'
  return 'none'
}
