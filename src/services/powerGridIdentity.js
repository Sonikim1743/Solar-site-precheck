// Only unique official equipment-number matches may supply missing identities.
// Proximity, place-name similarity and network connectivity are not identity proof.
const key = value => String(value || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase()
export function resolvePowerGridIdentities(data, dataset) {
  if (!data) return data
  const resolve = (items, records) => (items || []).map(item => {
    if (!item.ref) return item
    const candidates = (records || []).filter(record => key(record.no) === key(item.ref))
    if (candidates.length !== 1) return item
    const record = candidates[0]
    const voltages = (item.voltageValuesKv?.length ? item.voltageValuesKv : [item.voltageKv]).filter(Number.isFinite)
    if (voltages.length && Number.isFinite(record.voltageKv) && !voltages.includes(record.voltageKv)) return item
    return { ...item, name: record.name || item.name, identity: {
      method: 'official-equipment-number', label: '公式設備番号一致',
      originalName: item.name, equipmentNo: record.no, sourceUrl: record.sourceUrl || '',
    } }
  })
  const lines = resolve(data.lines, dataset?.lines)
  const substations = resolve(data.substations, dataset?.substations)
  const items = new Map([...lines, ...substations].map(item => [item.id, item]))
  const summary = Object.fromEntries(Object.entries(data.summary || {}).map(([k, v]) => [k, items.get(v?.id) || v]))
  return { ...data, lines, substations, summary }
}
