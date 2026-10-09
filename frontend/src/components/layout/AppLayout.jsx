import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useOutlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../store/auth';
import { useTheme } from '../../context/ThemeContext';

function ContentLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{ position: 'relative', width: 44, height: 44 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.15)', animation: 'spin 2s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#3b82f6', animation: 'spin 0.75s linear infinite' }} />
        </div>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', letterSpacing: '0.04em' }}>Carregando...</p>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  useEffect(() => {
    fetchMe().finally(() => setInitialLoading(false));
  }, []);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--bg-surface)' }}
      data-theme={theme}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
      />

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ minWidth: 0, background: 'var(--bg-surface)' }}
      >
        {initialLoading ? (
          <ContentLoader />
        ) : (
          <div
            key={displayPath}
            className={`page-transition page-transition--${stage}`}
            onAnimationEnd={handleAnimationEnd}
            style={{ minHeight: '100%', padding: '1.5rem' }}
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
