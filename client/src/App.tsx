import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Layout } from './components/Layout';
import { ApprovalPhasePage } from './pages/ApprovalPhasePage';
import { BudgetLineItemPage } from './pages/BudgetLineItemPage';
import { ClarificationFMPage } from './pages/ClarificationFMPage';
import { ClarificationFOPage } from './pages/ClarificationFOPage';
import { FinanceAdminAccountPage } from './pages/FinanceAdminAccountPage';
import { FinanceAdminBudgetPeriodPage } from './pages/FinanceAdminBudgetPeriodPage';
import { FinanceAdminCostCentrePage } from './pages/FinanceAdminCostCentrePage';
import { FinanceAdminFundingPage } from './pages/FinanceAdminFundingPage';
import { FinanceAdminInflationRatePage } from './pages/FinanceAdminInflationRatePage';
import { FinSupportedPage } from './pages/FinSupportedPage';
import { MtpInactiveUsersPage } from './pages/MtpInactiveUsersPage';
import { MtpVariancePage } from './pages/MtpVariancePage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectProfileList } from './pages/ProjectProfileList';
import { ProjectProfileRequestPage } from './pages/ProjectProfileRequestPage';
import { ReviewPhasePage } from './pages/ReviewPhasePage';
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
        <Route path="/mtp/variance" element={<MtpVariancePage />} />
        <Route path="/mtp/review-phase" element={<ReviewPhasePage />} />
        <Route path="/mtp/clarification-fo" element={<ClarificationFOPage />} />
        <Route path="/mtp/clarification-fm" element={<ClarificationFMPage />} />
        <Route path="/mtp/approval-phase" element={<ApprovalPhasePage />} />
        <Route path="/mtp/fin-supported" element={<FinSupportedPage />} />
        <Route path="/mtp/inactive-users" element={<MtpInactiveUsersPage />} />
        <Route path="/finance-admin/funding" element={<FinanceAdminFundingPage />} />
        <Route path="/finance-admin/account" element={<FinanceAdminAccountPage />} />
        <Route path="/finance-admin/cost-centre" element={<FinanceAdminCostCentrePage />} />
        <Route path="/finance-admin/budget-period" element={<FinanceAdminBudgetPeriodPage />} />
        <Route path="/finance-admin/inflation-rate" element={<FinanceAdminInflationRatePage />} />
        <Route path="/it-admin/users" element={<UserManagementPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Layout>
  );
}
