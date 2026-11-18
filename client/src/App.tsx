import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Layout } from './components/Layout';
import { BudgetLineItemPage } from './pages/BudgetLineItemPage';
import { FinanceAdminAccountPage } from './pages/FinanceAdminAccountPage';
import { FinanceAdminCostCentrePage } from './pages/FinanceAdminCostCentrePage';
import { FinanceAdminFundingPage } from './pages/FinanceAdminFundingPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectProfileList } from './pages/ProjectProfileList';
import { ProjectProfileRequestPage } from './pages/ProjectProfileRequestPage';
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
        <Route path="/projects/requests" element={<ProjectProfileRequestPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/mtp/budget-line-item" element={<BudgetLineItemPage />} />
        <Route path="/finance-admin/funding" element={<FinanceAdminFundingPage />} />
        <Route path="/finance-admin/account" element={<FinanceAdminAccountPage />} />
        <Route path="/finance-admin/cost-centre" element={<FinanceAdminCostCentrePage />} />
        <Route path="/it-admin/users" element={<UserManagementPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Layout>
  );
}
