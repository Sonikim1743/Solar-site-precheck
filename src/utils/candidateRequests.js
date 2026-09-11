// A candidate change invalidates every pending result; a newer request only
// supersedes the same analysis, leaving other work on that candidate intact.
export function createCandidateRequests() {
  let revision = 0
  const requests = new Map()
  return {
    invalidateAll() { revision += 1; requests.clear() },
    invalidate(kind) { requests.set(kind, (requests.get(kind) || 0) + 1) },
    start(kind) {
      const candidate = revision
      const sequence = (requests.get(kind) || 0) + 1
      requests.set(kind, sequence)
      return () => candidate === revision && requests.get(kind) === sequence
    },
  }
}
