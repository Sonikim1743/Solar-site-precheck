const VISIT_COUNTER_KEY = 'solar-site-precheck-local-visit-count-v1'
const VISIT_LAST_AT_KEY = 'solar-site-precheck-local-visit-last-at-v1'

function safeCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

export function recordLocalVisit(storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return { count: 0, lastAt: null }
  try {
    const count = safeCount(storage.getItem(VISIT_COUNTER_KEY)) + 1
    const lastAt = new Date(now).toISOString()
    storage.setItem(VISIT_COUNTER_KEY, String(count))
    storage.setItem(VISIT_LAST_AT_KEY, lastAt)
    return { count, lastAt }
  } catch {
    return { count: 0, lastAt: null }
  }
}

export function readLocalVisitStats(storage = globalThis.localStorage) {
  if (!storage) return { count: 0, lastAt: null }
  try {
    return {
      count: safeCount(storage.getItem(VISIT_COUNTER_KEY)),
      lastAt: storage.getItem(VISIT_LAST_AT_KEY) || null,
    }
  } catch {
    return { count: 0, lastAt: null }
  }
}
