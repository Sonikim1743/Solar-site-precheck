// Voltage display filters never filter substations by their primary/secondary voltage.
export function filterPowerGridView(data, { min = 11, max = 77, unknown = true, showLines = true, showSubstations = true } = {}) {
  if (!data) return null
  const byDistance = (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)
  const lines = showLines ? (data.lines || []).filter((line) => {
    const values = (line.voltageValuesKv?.length ? line.voltageValuesKv : [line.voltageKv]).filter(Number.isFinite)
    return values.length ? values.some((v) => v >= min && v <= max) : unknown
  }).sort(byDistance) : []
  const substations = showSubstations ? [...(data.substations || [])].sort(byDistance) : []
  return { ...data, lines, substations, summary: { ...data.summary, nearestLine: lines[0] || null, nearestPreferredLine: null, nearestSubstation: substations[0] || null } }
}
