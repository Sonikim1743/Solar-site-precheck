// URL coordinates use the same Japan coverage as the address/coordinate search.
// A link opens an isolated, unsaved workspace; it never supplies record contents.
export function parseCoordinateLink(search = '') {
  const params = new URLSearchParams(search)
  if (!params.has('lat') && !params.has('lon')) return { status: 'none', key: 'draft' }

  const latValues = params.getAll('lat')
  const lonValues = params.getAll('lon')
  const invalid = { status: 'invalid', key: `invalid:${JSON.stringify([latValues, lonValues])}` }
  if (latValues.length !== 1 || lonValues.length !== 1) return invalid

  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
  const latText = latValues[0].trim()
  const lonText = lonValues[0].trim()
  if (!decimal.test(latText) || !decimal.test(lonText)) return invalid
  const lat = Number(latText)
  const lon = Number(lonText)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 50 || lon < 120 || lon > 155) return invalid
  return { status: 'valid', key: `point:${lat},${lon}`, position: { lat, lon } }
}

export function savedWorkspaceUrl(href) {
  const url = new URL(href)
  url.searchParams.delete('lat')
  url.searchParams.delete('lon')
  url.hash = 'site-select'
  return url.href
}

// Guard the persistence boundary as well as the UI's autosave timer. Link
// workspaces must never read or replace the saved candidate's evidence.
export function loadCoordinateWorkspaceDraft(link, loadSavedDraft) {
  return link.status === 'none' ? loadSavedDraft() : {}
}

export function saveCoordinateWorkspaceDraft(link, storage, key, draft) {
  if (link.status !== 'none') return false
  storage.setItem(key, JSON.stringify(draft))
  return true
}
