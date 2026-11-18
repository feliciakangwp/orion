import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Layout } from './components/Layout';
import { FinanceAdminFundingPage } from './pages/FinanceAdminFundingPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectProfileList } from './pages/ProjectProfileList';
import { UserManagementPage } from './pages/UserManagementPage';

export default function App() {
  const { loading } = useAuth();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading ORION&hellip;</div>;
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectProfileList />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/finance-admin/funding" element={<FinanceAdminFundingPage />} />
        <Route path="/it-admin/users" element={<UserManagementPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Layout>
  );
}
