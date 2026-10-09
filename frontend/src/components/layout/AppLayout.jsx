import React, { useState, useEffect, Suspense } from 'react';
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
 * PageTransition — fade suave entre rotas.
 *
 * Funcionamento correto (após AppLayout virar import estático em App.jsx):
 *
 *   1. Usuário clica em um link → React Router muda location.pathname
 *   2. AnimatePresence detecta a mudança de key → dispara exit na página atual
 *   3. Após o exit (0.22s), desmonta a página antiga e monta a nova
 *   4. A nova página entra com initial={{ opacity: 0 }} → anima para opacity: 1
 *
 * O resultado é um fade out da página antiga e um fade in da nova — suave,
 * sem flash, sem "aparece → some → reaparece".
 *
 * Por que funcionava errado antes:
 *   AppLayout era lazy(). O Suspense externo do App.jsx, ao detectar um chunk
 *   ainda não carregado, desmontava o motion.div inteiro e exibia o PageLoader.
 *   Quando o chunk carregava, o motion.div remontava e animava do zero —
 *   causando o efeito "página aparece → some → reaparece".
 *
 * Agora AppLayout é estático → o Suspense externo nunca o desmonta →
 * AnimatePresence fica sempre montado e gerencia o ciclo corretamente.
 *
 * O Suspense interno (fallback={null}) é um safety net para chunks ainda
 * carregando. Com o prefetch em App.jsx, raramente fica pendente.
 */
function PageTransition() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
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
