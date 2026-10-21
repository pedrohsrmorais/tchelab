import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useOutlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../store/auth';
import { useTheme } from '../../context/ThemeContext';

function ContentLoader() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ position: 'relative', width: 44, height: 44 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.15)', animation: 'spin 2s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#3b82f6', animation: 'spin 0.75s linear infinite' }} />
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.04em' }}>{t('common.loading')}</p>
      </div>
    </div>
  );
}

// Breakpoints: <768px sidebar vira drawer (hambúrguer); 768–1023px começa recolhida (só ícones);
// ≥1024px começa expandida. O usuário ainda pode alternar manualmente no desktop/tablet.
function useViewport() {
  const get = () => (typeof window === 'undefined' ? 1280 : window.innerWidth);
  const [w, setW] = useState(get);
  useEffect(() => {
    const onResize = () => setW(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

export default function AppLayout() {
  const vw = useViewport();
  const isMobile = vw < 768;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1024));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [initialLoading, setInitialLoading]     = useState(true);
  const { fetchMe } = useAuthStore();
  const { theme } = useTheme();

  const location = useLocation();
  const outlet    = useOutlet(); // elemento da rota atualmente casada (via <Outlet/>)

  // ── Transição suave entre páginas (fade-out → fade-in), 100% CSS ──────────
  // Sem framer-motion: a troca de conteúdo só acontece depois que a animação
  // de saída termina, então nunca existe um frame "em branco" entre páginas,
  // e nenhuma lib externa fica no caminho do render (o que já causou crash
  // com React 19 + R3F no passado).
  const [displayOutlet, setDisplayOutlet] = useState(outlet);
  const [displayPath, setDisplayPath]     = useState(location.pathname);
  const [stage, setStage]                 = useState('in'); // 'in' | 'out'
  const pendingRef = useRef({ outlet, pathname: location.pathname });

  useEffect(() => {
    pendingRef.current = { outlet, pathname: location.pathname };
  });

  useEffect(() => {
    if (location.pathname !== displayPath) {
      setStage('out');
    }
  }, [location.pathname, displayPath]);

  const handleAnimationEnd = (e) => {
    if (e.target !== e.currentTarget) return; // ignora bubbling de filhos
    if (stage === 'out') {
      setDisplayOutlet(pendingRef.current.outlet);
      setDisplayPath(pendingRef.current.pathname);
      setStage('in');
    }
  };

  // Fecha o drawer ao navegar e ao sair do modo mobile; Esc também fecha.
  useEffect(() => { setMobileOpen(false); }, [location.pathname, isMobile]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  useEffect(() => {
    fetchMe().finally(() => setInitialLoading(false));
  }, []);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--bg-surface)' }}
      data-theme={theme}
    >
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
        />
      )}
      <Sidebar
        collapsed={isMobile ? false : sidebarCollapsed}
        onToggle={() => (isMobile ? setMobileOpen(false) : setSidebarCollapsed(v => !v))}
        mobile={isMobile}
        mobileOpen={mobileOpen}
      />

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ minWidth: 0, background: 'var(--bg-surface)' }}
      >
        {isMobile && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 10,
            padding: '0.5rem 0.75rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Menu"
              aria-expanded={mobileOpen}
              style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--text-primary)', display: 'inline-flex' }}
            >
              <Menu size={22} />
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>TcheLab</span>
          </div>
        )}
        {initialLoading ? (
          <ContentLoader />
        ) : (
          <div
            key={displayPath}
            className={`page-transition page-transition--${stage}`}
            onAnimationEnd={handleAnimationEnd}
            style={{
              minHeight: '100%',
              padding: isMobile ? '0.75rem' : '1.5rem',
              // altura útil da área de conteúdo (descontando padding e, no mobile, a barra superior);
              // páginas "app-like" (Workspace) usam var(--page-h) em vez de height:100%, que não resolve aqui.
              '--page-h': isMobile ? 'calc(100dvh - 1.5rem - 49px)' : 'calc(100dvh - 3rem)',
            }}
          >
            <Suspense fallback={<ContentLoader />}>
              {displayOutlet}
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}
