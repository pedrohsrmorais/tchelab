import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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

/**
 * PageTransition — cross-fade entre rotas sem animação de entrada redundante.
 *
 * Comportamento desejado:
 *   Clicou no link → página atual faz fade-out (0.35s)
 *                  → nova página aparece imediatamente (opacity=1, sem fade-in)
 *
 * Por que NÃO usar initial={{ opacity: 0 }} + animate={{ opacity: 1 }}:
 *   Isso causaria "página aparece → fade-out → fade-in dela mesma" porque
 *   o AnimatePresence mode="wait" primeiro completa o exit da página anterior
 *   e SÓ ENTÃO monta a nova. Com initial=0, a nova página aparece do zero
 *   fazendo fade-in — o usuário vê a tela piscar.
 *
 * Solução: a nova página entra com opacity=1 (sem animação de entrada).
 *   Apenas a saída anima. Isso dá a sensação de troca suave sem flash.
 *
 * Suspense fallback=null: mantém o motion.div montado mesmo quando o chunk
 * lazy ainda está carregando, impedindo que o Suspense externo substitua
 * o motion.div e quebre a animação de saída.
 */
function PageTransition() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 1 }}   // nova página já visível ao montar
        animate={{ opacity: 1 }}   // nenhuma animação de entrada
        exit={{ opacity: 0 }}      // página antiga faz fade-out ao sair
        transition={{ opacity: { duration: 0.3, ease: 'easeOut' } }}
        style={{ minHeight: '100%', padding: '1.5rem' }}
      >
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [initialLoading, setInitialLoading]     = useState(true);
  const { fetchMe } = useAuthStore();
  const { theme } = useTheme();

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
          <PageTransition />
        )}
      </main>
    </div>
  );
}
