import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
