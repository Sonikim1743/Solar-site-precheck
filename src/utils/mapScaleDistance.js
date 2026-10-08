// Leaflet supplies the real distance covered by the scale's maximum width.
// Keep its unit/pixel conversion, and add the 1.5 step (for example, 15 m).
export function roundMapScaleDistance(maxDistance) {
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return 0
  const exponent = Math.floor(Math.log10(maxDistance))
  let distance = 0
  // Include the preceding decade for values whose logarithm rounds upwards.
  // Scientific notation also avoids an underflowing 10 ** exponent at tiny values.
  for (const power of [exponent - 1, exponent]) {
    for (const step of [1, 1.5, 2, 3, 5, 10]) {
      const candidate = Number(`${step}e${power}`)
      if (candidate > distance && candidate <= maxDistance) distance = candidate
    }
  }
  return distance
}
