// The solar workspace stays mounted to preserve inputs and 3D state.
// Wait for a lazy destination, never focusing a heading in its hidden sibling.
export function focusVisiblePageHeading(documentRef = document, Observer = MutationObserver) {
  let observer, timer
  const stop = () => { observer?.disconnect(); clearTimeout(timer) }
  const focus = () => {
    const heading = Array.from(documentRef.querySelectorAll('main h1, main h2'))
      .find(node => !node.closest('[hidden]') && node.getClientRects().length)
    if (!heading) return false
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
    stop()
    return true
  }
  if (!focus()) {
    observer = new Observer(focus)
    observer.observe(documentRef.querySelector('main'), { childList: true, subtree: true })
    timer = setTimeout(stop, 5000)
  }
  return stop
}
