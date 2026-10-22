import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Popover ancorado a um elemento (renderizado em document.body, então não é cortado por `overflow`).
 * Fecha com clique fora, Esc e ao rolar a página. Vira para cima se não couber embaixo.
 */
export default function Popover({ anchor, onClose, children, width = 240, align = 'left', maxHeight = 360, className = '' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight || 200;
    const w = Math.min(width, window.innerWidth - 16);
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ left, top });
  }, [anchor, width, align, children]);

  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains(e.target)) onClose?.(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    const scroll = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div ref={ref} role="dialog" className={`board-pop ${className}`}
      style={{ position: 'fixed', left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 16), maxHeight, overflowY: 'auto', zIndex: 60,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)' }}>
      {children}
    </div>,
    document.body,
  );
}
