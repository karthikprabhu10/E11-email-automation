import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function Logo() {
  return (
    <div className="logo" aria-label="E11, Email Automation">
      <div className="logo-mark">E11</div>
      <div className="logo-sub">Email Automation</div>
    </div>
  )
}

export function Stat({ k, v }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v mono">{v}</div>
    </div>
  )
}

export function Badge({ kind, children }) {
  return <span className={`badge ${kind || ''}`}>{children}</span>
}

export function Notice({ title, children, onClose }) {
  return (
    <div className="notice" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <b>{title}</b> {children}
      </div>
      {onClose && (
        <button className="btn icon sm x" onClick={onClose} aria-label="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
