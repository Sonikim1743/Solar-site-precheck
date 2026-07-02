export function installBrowserCompat() {
  if (typeof Promise !== 'undefined' && typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function withResolvers() {
      let resolve
      let reject
      const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve
        reject = promiseReject
      })
      return { promise, resolve, reject }
    }
  }

  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      value(index) {
        const length = this.length
        const relativeIndex = Math.trunc(index) || 0
        const targetIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex
        if (targetIndex < 0 || targetIndex >= length) return undefined
        return this[targetIndex]
      },
      configurable: true,
      writable: true,
    })
  }

  if (!String.prototype.at) {
    Object.defineProperty(String.prototype, 'at', {
      value(index) {
        const length = this.length
        const relativeIndex = Math.trunc(index) || 0
        const targetIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex
        if (targetIndex < 0 || targetIndex >= length) return undefined
        return this.charAt(targetIndex)
      },
      configurable: true,
      writable: true,
    })
  }
}
