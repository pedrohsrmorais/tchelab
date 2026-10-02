import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './store/auth';
import { PageLoader } from './components/ui/Spinner';

// Lazy-loaded pages
const LoginPage     = lazy(() => import('./pages/auth/LoginPage'));
const AppLayout     = lazy(() => import('./components/layout/AppLayout'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage  = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const DatasetsPage  = lazy(() => import('./pages/DatasetsPage'));
const DatasetDetailPage = lazy(() => import('./pages/DatasetDetailPage'));
const CommunitiesPage = lazy(() => import('./pages/CommunitiesPage'));
const CommunityDetailPage = lazy(() => import('./pages/CommunityDetailPage'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'));
const WorkflowEditorPage = lazy(() => import('./pages/WorkflowEditorPage'));
const ArticlesPage  = lazy(() => import('./pages/ArticlesPage'));
const ModelsPage    = lazy(() => import('./pages/ModelsPage'));
const JobsPage      = lazy(() => import('./pages/JobsPage'));
const AIPage        = lazy(() => import('./pages/AIPage'));
const AdminPage     = lazy(() => import('./pages/AdminPage'));
const ProfilePage   = lazy(() => import('./pages/ProfilePage'));

// Page transition wrapper
const PageTransition = ({ children }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

// Protected route guard
const ProtectedRoute = ({ children, requirePlus = false, requireAdmin = false }) => {
  const { token, isPlus, isAdmin } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin()) return <Navigate to="/" replace />;
  if (requirePlus && !isPlus()) return <Navigate to="/" replace />;
  return children;
};

// Public route (redirect if already authenticated)
const PublicRoute = ({ children }) => {
  const { token } = useAuthStore();
  if (token) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  return (
    <Suspense fallback={<PageLoader text="Carregando TcheLab..." />}>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />

        {/* App shell */}
        <Route path="/" element={
          <ProtectedRoute><AppLayout /></ProtectedRoute>
        }>
          <Route index element={
            <PageTransition><DashboardPage /></PageTransition>
          } />

          <Route path="projects" element={
            <PageTransition><ProjectsPage /></PageTransition>
          } />
          <Route path="projects/:id" element={
            <PageTransition><ProjectDetailPage /></PageTransition>
          } />

          <Route path="datasets" element={
            <PageTransition><DatasetsPage /></PageTransition>
          } />
          <Route path="datasets/:id" element={
            <PageTransition><DatasetDetailPage /></PageTransition>
          } />

          <Route path="communities" element={
            <PageTransition><CommunitiesPage /></PageTransition>
          } />
          <Route path="communities/:id" element={
            <PageTransition><CommunityDetailPage /></PageTransition>
          } />

          <Route path="workflows" element={
            <PageTransition><WorkflowsPage /></PageTransition>
          } />
          <Route path="workflows/:id" element={
            <PageTransition><WorkflowEditorPage /></PageTransition>
          } />

          <Route path="articles" element={
            <PageTransition><ArticlesPage /></PageTransition>
          } />

          <Route path="models" element={
            <PageTransition><ModelsPage /></PageTransition>
          } />

          <Route path="jobs" element={
            <PageTransition><JobsPage /></PageTransition>
          } />

          <Route path="ai" element={
            <ProtectedRoute requirePlus>
              <PageTransition><AIPage /></PageTransition>
            </ProtectedRoute>
          } />

          <Route path="admin" element={
            <ProtectedRoute requireAdmin>
              <PageTransition><AdminPage /></PageTransition>
            </ProtectedRoute>
          } />

          <Route path="profile" element={
            <PageTransition><ProfilePage /></PageTransition>
          } />
        </Route>

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
