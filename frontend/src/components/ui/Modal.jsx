import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const maxW = { sm: '28rem', md: '40rem', lg: '56rem', xl: '72rem' }[size] || '40rem'

  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'max(0.5rem, 2vw)',
               background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', animation:'fadeInUp 0.2s ease' }}>
      <div
        onClick={e => e.stopPropagation()}
        className="anim-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={{ position:'relative', width:'100%', maxWidth:maxW, maxHeight:'calc(100dvh - 1rem)', display:'flex', flexDirection:'column', background:'var(--bg-elevated)', border:'1px solid var(--border)',
                 borderRadius:'var(--radius-xl)', overflow:'hidden', boxShadow:'var(--shadow-lg)' }}>
        {title && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1.25rem 1.5rem',
                        borderBottom:'1px solid var(--border)' }}>
            <h2 style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--text-primary)' }}>{title}</h2>
            <button onClick={onClose} className="btn-ghost" aria-label="Close" style={{ padding:'0.25rem' }}>
              <X size={18} />
            </button>
          </div>
        )}
        {!title && (
          <button onClick={onClose} className="btn-ghost" aria-label="Close"
            style={{ position:'absolute', top:'0.6rem', right:'0.6rem', zIndex:2, padding:'0.35rem', borderRadius:'999px',
                     background:'var(--bg-elevated)', border:'1px solid var(--border)' }}>
            <X size={16} />
          </button>
        )}
        <div style={{ padding:'clamp(1rem, 4vw, 1.5rem)', flex:'1 1 auto', minHeight:0, overflowY:'auto' }}>{children}</div>
      </div>
    </div>
  )
}

export default Modal;
