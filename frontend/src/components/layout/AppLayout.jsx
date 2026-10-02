import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import { PageLoader } from '../ui/Spinner';
import { useAuthStore } from '../../store/auth';

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const { fetchMe, user } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    fetchMe().finally(() => setInitialLoading(false));
  }, []);

  if (initialLoading) {
    return <PageLoader text={`Bem-vindo ao TcheLab${user ? `, ${user.name?.split(' ')[0]}` : ''}...`} />;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f172a' }}>
      {/* Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />

      {/* Main content */}
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden transition-all duration-300"
        style={{ minWidth: 0 }}
      >
        <div className="min-h-full p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
