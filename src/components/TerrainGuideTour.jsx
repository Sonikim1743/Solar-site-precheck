import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './terrain-guide-tour.css'

const SCREEN_GAP = 12

function visibleAnchor(names) {
  for (const name of [names].flat().filter(Boolean)) {
    const candidates = document.querySelectorAll(`[data-terrain-tour-anchor="${name}"]`)
    for (const element of candidates) {
      if (element.closest('[hidden]')) continue
      const closed = element.closest('details:not([open])')
      if (closed && !closed.querySelector(':scope > summary')?.contains(element)) continue
      const rect = element.getBoundingClientRect()
      if (rect.width && rect.height && element.getClientRects().length && window.getComputedStyle(element).visibility === 'visible') {
        return { element, rect }
      }
    }
  }
  return null
}

function viewport() {
  const root = document.documentElement
  return { width: root.clientWidth || window.innerWidth, height: root.clientHeight || window.innerHeight }
}

function isOutside(rect, screen) {
  const outside = rect.bottom <= 0 || rect.top >= screen.height || rect.right <= 0 || rect.left >= screen.width
  return outside || (rect.height < screen.height && (rect.top < 0 || rect.bottom > screen.height))
}

function visibleOutline(rect, screen) {
  if (!rect) return null
  const left = Math.round(Math.max(4, rect.left - 6))
  const top = Math.round(Math.max(4, rect.top - 6))
  const right = Math.round(Math.min(screen.width - 4, rect.right + 6))
  const bottom = Math.round(Math.min(screen.height - 4, rect.bottom + 6))
  if (right <= left || bottom <= top) return null
  return { left, top, width: right - left, height: bottom - top }
}

const clampPosition = (position, limit, size) => Math.max(SCREEN_GAP, Math.min(position, limit - size - SCREEN_GAP))

function placeCallout(outline, screen, width, height) {
  if (!outline) return null
  const right = outline.left + outline.width
  const bottom = outline.top + outline.height
  const x = clampPosition(outline.left + (outline.width - width) / 2, screen.width, width)
  const y = clampPosition(outline.top + (outline.height - height) / 2, screen.height, height)
  if (bottom + height + 2 * SCREEN_GAP <= screen.height) return { left: x, top: bottom + SCREEN_GAP }
  if (outline.top >= height + 2 * SCREEN_GAP) return { left: x, top: outline.top - height - SCREEN_GAP }
  if (right + width + 2 * SCREEN_GAP <= screen.width) return { left: right + SCREEN_GAP, top: y }
  if (outline.left >= width + 2 * SCREEN_GAP) return { left: outline.left - width - SCREEN_GAP, top: y }
  return { left: x, top: clampPosition(screen.height - height - SCREEN_GAP, screen.height, height) }
}

function sameRect(a, b) {
  return a === b || Boolean(a && b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)
}

export default function TerrainGuideTour({ step, steps, onNext, onBack, onEnd }) {
  const current = step == null ? null : steps[step]
  const overlay = useRef(null)
  const bubble = useRef(null)
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (!current) {
      setPosition(null)
      return
    }
    let frame = null
    let activeElement = null
    const seen = new Set()
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(sync)
    }
    const sizeObserver = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(schedule) : null

    function sync() {
      frame = null
      const screen = viewport()
      const primary = visibleAnchor(current.anchor)
      const target = primary || visibleAnchor(current.fallbackAnchor)
      const element = target?.element ?? null
      if (element !== activeElement) {
        if (activeElement) sizeObserver?.unobserve(activeElement)
        activeElement = element
        if (element) sizeObserver?.observe(element)
      }
      if (target && !seen.has(element)) {
        seen.add(element)
        if (isOutside(target.rect, screen)) {
          const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          element.scrollIntoView?.({ behavior: reduced ? 'instant' : 'smooth', block: 'center', inline: 'nearest' })
        }
      }
      const outline = visibleOutline(target?.rect, screen)
      const bubbleRect = bubble.current?.getBoundingClientRect()
      const width = bubbleRect?.width || Math.min(340, screen.width - 2 * SCREEN_GAP)
      const height = bubbleRect?.height || 140
      const callout = placeCallout(outline, screen, width, height)
      setPosition(previous => previous?.step === step && sameRect(previous.outline, outline) && sameRect(previous.callout, callout)
        ? previous : { step, outline, callout })
    }

    if (bubble.current) sizeObserver?.observe(bubble.current)
    const mutationObserver = typeof window.MutationObserver === 'function' ? new window.MutationObserver(records => {
      if (records.some(record => !overlay.current?.contains(record.target))) schedule()
    }) : null
    mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'data-terrain-tour-anchor'],
    })
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    sync()
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      sizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [current, step])

  if (!current || typeof document === 'undefined') return null
  const state = position?.step === step ? position : null
  const outline = state?.outline
  const guidePosition = outline && { left: outline.left + outline.width / 2, top: outline.top + outline.height / 2 }

  return createPortal(<div className="terrain-guide-tour" ref={overlay}>
    {outline && <>
      <span className="terrain-guide-tour-ring" aria-hidden="true" style={outline} />
      <span className="terrain-guide-tour-pointer" aria-hidden="true" style={guidePosition}>
        <span className="terrain-guide-tour-pointer-tap" key={`tap-${step}`} />
        <span className="terrain-guide-tour-pointer-arrow" key={step} />
      </span>
    </>}
    <aside className="terrain-guide-tour-callout" aria-label="操作チュートリアル" data-anchored={Boolean(state?.callout)} ref={bubble} style={state?.callout ?? undefined}>
      <div className="terrain-guide-tour-copy" aria-live="polite" aria-atomic="true">
        <div className="terrain-guide-tour-heading">
          <strong>{current.title || 'チュートリアル'}</strong>
          <span>{step + 1} / {steps.length}</span>
        </div>
        <p>{current.message}</p>
      </div>
      <div className="terrain-guide-tour-actions" role="group" aria-label="チュートリアルの操作">
        <button type="button" className="terrain-guide-tour-end" onClick={onEnd}>終了</button>
        <button type="button" onClick={onBack} disabled={step === 0}>戻る</button>
        <button type="button" className="terrain-guide-tour-next" onClick={onNext}>{step === steps.length - 1 ? '完了' : '次へ'}</button>
      </div>
    </aside>
  </div>, document.body)
}
