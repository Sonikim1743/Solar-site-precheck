// The mutable stage advances immediately, including two clicks in one render.
export function createMapReset() {
  let stage = 'selection'
  return {
    get stage() { return stage },
    next() { const action = stage; stage = 'view'; return action },
    selected() { stage = 'selection' },
  }
}
