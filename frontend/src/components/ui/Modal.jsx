import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const maxW = { sm: '28rem', md: '40rem', lg: '56rem', xl: '72rem' }[size] || '40rem'

  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem',
               background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', animation:'fadeInUp 0.2s ease' }}>
      <div
        onClick={e => e.stopPropagation()}
        className="anim-scale-in"
        style={{ width:'100%', maxWidth:maxW, background:'rgba(15,23,42,0.95)', border:'1px solid rgba(255,255,255,0.1)',
                 borderRadius:'1.25rem', overflow:'hidden', boxShadow:'0 25px 60px rgba(0,0,0,0.5)' }}>
        {title && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1.25rem 1.5rem',
                        borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
            <h2 style={{ fontWeight:700, fontSize:'1.1rem', color:'#fff' }}>{title}</h2>
            <button onClick={onClose} className="btn-ghost" style={{ padding:'0.25rem' }}>
              <X size={18} />
            </button>
          </div>
        )}
        <div style={{ padding:'1.5rem', maxHeight:'80vh', overflowY:'auto' }}>{children}</div>
      </div>
    </div>
  )
}

export default Modal;
