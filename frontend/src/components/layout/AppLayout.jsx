import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import { PageLoader } from '../ui/Spinner';
import { useAuthStore } from '../../store/auth';
import { useTheme } from '../../context/ThemeContext';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [initialLoading, setInitialLoading]     = useState(true);
  const { fetchMe, user } = useAuthStore();
  const { theme } = useTheme();
  const location = useLocation();

  useEffect(() => {
    fetchMe().finally(() => setInitialLoading(false));
  }, []);

  if (initialLoading) {
    return <PageLoader text={`Bem-vindo ao TcheLab${user ? `, ${user.name?.split(' ')[0]}` : ''}...`} />;
  }

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
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ minHeight: '100%', padding: '1.5rem' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
