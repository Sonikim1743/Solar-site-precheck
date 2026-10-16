import { useId, useRef, useState } from 'react'

export default function TerrainHelpDialog({ title, children, symbol = '?' }) {
  const dialogRef = useRef(null)
  const buttonRef = useRef(null)
  const [open, setOpen] = useState(false)
  const id = `terrain-help-${useId().replace(/:/g, '')}`
  return <>
    <button ref={buttonRef} type="button" className={`terrain-help-button${symbol === 'i' ? ' terrain-info-button' : ''}`} aria-label={`${title}を開く`} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-dialog`} onClick={() => { dialogRef.current?.showModal(); setOpen(true) }}>{symbol}</button>
    <dialog ref={dialogRef} id={`${id}-dialog`} className="terrain-help-dialog" aria-labelledby={id} onClose={() => { setOpen(false); buttonRef.current?.focus({ preventScroll: true }) }} onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close()
    }}>
      <header><h3 id={id}>{title}</h3><button type="button" autoFocus onClick={() => dialogRef.current?.close()}>閉じる</button></header>
      <div className="terrain-help-content">{children}</div>
    </dialog>
  </>
}
