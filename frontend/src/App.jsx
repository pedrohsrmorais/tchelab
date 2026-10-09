import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { PageLoader } from './components/ui/Spinner';

// Lazy-loaded pages
// Using /* @vite-ignore */ to suppress unused-import warnings for prefetch hints.
// All route chunks are eagerly prefetched after the main bundle loads so that
// navigations never trigger a Suspense fallback (which would cause flicker inside
// AnimatePresence). The Suspense boundary in AppLayout uses fallback={null} as a
// safety net, but ideally the chunks are already cached.
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

// Prefetch all route chunks immediately after the main bundle loads.
// This means navigations will almost never trigger a Suspense suspension,
// so AnimatePresence transitions stay smooth with no blank-frame flicker.
if (typeof window !== 'undefined') {
  // Use requestIdleCallback (or setTimeout fallback) so we don't block
  // the initial render / paint.
  const prefetch = () => {
    import('./pages/DashboardPage');
    import('./pages/ProjectsPage');
    import('./pages/ProjectDetailPage');
    import('./pages/DatasetsPage');
    import('./pages/DatasetDetailPage');
    import('./pages/CommunitiesPage');
    import('./pages/CommunityDetailPage');
    import('./pages/WorkflowsPage');
    import('./pages/WorkflowEditorPage');
    import('./pages/ArticlesPage');
    import('./pages/ModelsPage');
    import('./pages/JobsPage');
    import('./pages/AIPage');
    import('./pages/AdminPage');
    import('./pages/ProfilePage');
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetch);
  } else {
    setTimeout(prefetch, 200);
  }
}

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
    // PageLoader only shows during initial JS bundle load (Suspense boundary)
    // After that, AppLayout renders immediately and handles its own inner loader
    <Suspense fallback={<PageLoader text="Carregando TcheLab..." />}>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />

        {/* App shell — AppLayout owns page transitions internally */}
        <Route path="/" element={
          <ProtectedRoute><AppLayout /></ProtectedRoute>
        }>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="datasets" element={<DatasetsPage />} />
          <Route path="datasets/:id" element={<DatasetDetailPage />} />
          <Route path="communities" element={<CommunitiesPage />} />
          <Route path="communities/:id" element={<CommunityDetailPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="workflows/:id" element={<WorkflowEditorPage />} />
          <Route path="articles" element={<ArticlesPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="ai" element={
            <ProtectedRoute requirePlus><AIPage /></ProtectedRoute>
          } />
          <Route path="admin" element={
            <ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>
          } />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
