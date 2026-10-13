import { useId, useRef } from 'react'

export default function TerrainHelpDialog({ title, children }) {
  const dialogRef = useRef(null)
  const id = `terrain-help-${useId().replace(/:/g, '')}`
  return <>
    <button type="button" className="terrain-help-button" aria-label={`${title}を開く`} aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>?</button>
    <dialog ref={dialogRef} className="terrain-help-dialog" aria-labelledby={id} onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close()
    }}>
      <header><h3 id={id}>{title}</h3><button type="button" autoFocus onClick={() => dialogRef.current?.close()}>閉じる</button></header>
      <div className="terrain-help-content">{children}</div>
    </dialog>
  </>
}
