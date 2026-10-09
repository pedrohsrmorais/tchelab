import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { PageLoader } from './components/ui/Spinner';

// AppLayout é importado de forma ESTÁTICA — nunca pode ser lazy.
//
// Motivo: se AppLayout fosse lazy, o Suspense externo desmontaria o motion.div
// gerenciado pelo AnimatePresence toda vez que um chunk de página ainda não
// tivesse carregado, causando o efeito "aparece → some → reaparece".
// Com AppLayout estático, o shell fica sempre montado e o AnimatePresence
// gerencia o ciclo exit → enter corretamente.
import AppLayout from './components/layout/AppLayout';

// Páginas carregadas de forma lazy — o shell permanece montado enquanto
// os chunks carregam no fundo.
const LoginPage          = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage      = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage       = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage  = lazy(() => import('./pages/ProjectDetailPage'));
const DatasetsPage       = lazy(() => import('./pages/DatasetsPage'));
const DatasetDetailPage  = lazy(() => import('./pages/DatasetDetailPage'));
const CommunitiesPage    = lazy(() => import('./pages/CommunitiesPage'));
const CommunityDetailPage = lazy(() => import('./pages/CommunityDetailPage'));
const WorkflowsPage      = lazy(() => import('./pages/WorkflowsPage'));
const WorkflowEditorPage = lazy(() => import('./pages/WorkflowEditorPage'));
const ArticlesPage       = lazy(() => import('./pages/ArticlesPage'));
const ModelsPage         = lazy(() => import('./pages/ModelsPage'));
const JobsPage           = lazy(() => import('./pages/JobsPage'));
const AIPage             = lazy(() => import('./pages/AIPage'));
const AdminPage          = lazy(() => import('./pages/AdminPage'));
const ProfilePage        = lazy(() => import('./pages/ProfilePage'));

// Pré-carrega todos os chunks após a renderização inicial para que
// navegações subsequentes nunca acionem o Suspense interno.
if (typeof window !== 'undefined') {
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
    setTimeout(prefetch, 300);
  }
}

// Guards de rota
const ProtectedRoute = ({ children, requirePlus = false, requireAdmin = false }) => {
  const { token, isPlus, isAdmin } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin()) return <Navigate to="/" replace />;
  if (requirePlus && !isPlus()) return <Navigate to="/" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { token } = useAuthStore();
  if (token) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  return (
    // O Suspense externo cobre apenas o LoginPage (e o carregamento inicial
    // das páginas internas, que são lazy). O AppLayout em si nunca suspende.
    <Suspense fallback={<PageLoader text="Carregando TcheLab..." />}>
      <Routes>
        <Route path="/login" element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />

        {/* Shell da aplicação — AppLayout é estático, nunca suspende */}
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
