import React, { useState, useEffect } from 'react';
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

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [initialLoading, setInitialLoading]     = useState(true);
  const { fetchMe } = useAuthStore();
  const { theme } = useTheme();
  const location = useLocation();

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
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: 'easeInOut' }}
              style={{ minHeight: '100%', padding: '1.5rem' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
