import React, { useState, useEffect, useRef } from 'react';
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
 * PageTransition wraps the <Outlet /> and implements a smart fade:
 *
 * 1. On route change, the CURRENT page fades out over ~0.5s.
 * 2. The new page is mounted (React renders it, lazy chunks load, data hooks fire)
 *    WHILE the old page is still visible (or fading).
 * 3. The new page starts FULLY TRANSPARENT (opacity: 0) and only becomes
 *    visible AFTER the exit animation completes — thanks to AnimatePresence
 *    mode="wait", which lets the exit finish before starting the enter.
 * 4. The enter fade-in is quick (0.35s) so the total perceived delay is minimal.
 *
 * This eliminates the "flash" because:
 * - There is no blank frame between pages.
 * - The new page starts at opacity 0 and smoothly fades in once ready.
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
        transition={{
          // exit: slow fade-out so the old page lingers while new one loads
          // animate: quicker fade-in once new page is mounted and ready
          opacity: {
            duration: 0.5,
            ease: 'easeInOut',
          },
        }}
        style={{ minHeight: '100%', padding: '1.5rem' }}
      >
        <Outlet />
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
