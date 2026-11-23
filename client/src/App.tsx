import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Layout } from './components/Layout';
import { AnnualBudgetVariancePage } from './pages/AnnualBudgetVariancePage';
import { OriginalBudgetLineItemPage, RevisedBudgetLineItemPage } from './pages/AnnualBudgetLineItemPage';
import { ApprovalPhasePage } from './pages/ApprovalPhasePage';
import { BlockBudgetLineItemPage } from './pages/BlockBudgetLineItemPage';
import { BlockBudgetVariancePage } from './pages/BlockBudgetVariancePage';
import { BudgetLineItemPage } from './pages/BudgetLineItemPage';
import { ClarificationFMPage } from './pages/ClarificationFMPage';
import { ClarificationFOPage } from './pages/ClarificationFOPage';
import { FinanceAdminAccountPage } from './pages/FinanceAdminAccountPage';
import { FinanceAdminBudgetPeriodPage } from './pages/FinanceAdminBudgetPeriodPage';
import { FinanceAdminCostCentrePage } from './pages/FinanceAdminCostCentrePage';
import { FinanceAdminDivisionPage } from './pages/FinanceAdminDivisionPage';
import { FinanceAdminIctExpenditurePage } from './pages/FinanceAdminIctExpenditurePage';
import { FinanceAdminSubAccountPage } from './pages/FinanceAdminSubAccountPage';
import { FinanceAdminFundingPage } from './pages/FinanceAdminFundingPage';
import { FinanceAdminInflationRatePage } from './pages/FinanceAdminInflationRatePage';
import { FinSupportedPage } from './pages/FinSupportedPage';
import { MtpInactiveUsersPage } from './pages/MtpInactiveUsersPage';
import { MtpVariancePage } from './pages/MtpVariancePage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectAorDetailPage } from './pages/ProjectAorDetailPage';
import { ProjectAorListPage } from './pages/ProjectAorListPage';
import { ProjectFundingPotPage } from './pages/ProjectFundingPotPage';
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
        <Route path="/projects/aor" element={<ProjectAorListPage />} />
        <Route path="/projects/aor/:id" element={<ProjectAorDetailPage />} />
        <Route path="/projects/funding-pot" element={<ProjectFundingPotPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/mtp/budget-line-item" element={<BudgetLineItemPage />} />
        <Route path="/mtp/variance" element={<MtpVariancePage />} />
        <Route path="/mtp/review-phase" element={<ReviewPhasePage />} />
        <Route path="/mtp/clarification-fo" element={<ClarificationFOPage />} />
        <Route path="/mtp/clarification-fm" element={<ClarificationFMPage />} />
        <Route path="/mtp/approval-phase" element={<ApprovalPhasePage />} />
        <Route path="/mtp/fin-supported" element={<FinSupportedPage />} />
        <Route path="/mtp/inactive-users" element={<MtpInactiveUsersPage />} />
        <Route path="/annual/revised-budget-line-item" element={<RevisedBudgetLineItemPage />} />
        <Route path="/annual/original-budget-line-item" element={<OriginalBudgetLineItemPage />} />
        <Route path="/annual/variance" element={<AnnualBudgetVariancePage />} />
        <Route path="/annual/review-phase" element={<ReviewPhasePage kinds={['RB', 'OB']} title="Review Phase" description="Annual Budget lines currently awaiting your action at Review or Clarification. A line appears here only once it's actually routed to you." />} />
        <Route path="/annual/clarification-fm" element={<ClarificationFMPage kinds={['RB', 'OB']} title="Clarification (FM)" description="Annual Budget lines now routed to you for clarification." emptyMessage="No Annual Budget lines are currently routed to you." />} />
        <Route path="/annual/clarification-fo" element={<ClarificationFOPage kinds={['RB', 'OB']} title="Clarification (FO)" description="Annual Budget lines still with Finance Officer in the clarification stage — not yet your turn." emptyMessage="No Annual Budget lines are currently with Finance Officer." />} />
        <Route path="/annual/approval-phase" element={<ApprovalPhasePage kinds={['RB', 'OB']} title="Approval Phase" description="Annual Budget lines currently awaiting your approval (Reviewer 2, CIO, or Approver). A line appears here only once it's actually routed to you." />} />
        <Route path="/annual/fin-supported" element={<FinSupportedPage kinds={['RB', 'OB']} title="FIN Supported" emptyMessage="No Annual Budget lines have reached Approved yet." />} />
        <Route path="/annual/inactive-users" element={<MtpInactiveUsersPage kinds={['RB', 'OB']} title="Annual Budget with Inactive User" description="Annual Budget lines tagged to a user who is now Inactive in User Management — reassign these before they can move forward." emptyMessage="No Annual Budget lines are tagged to an Inactive user." />} />
        <Route path="/block/budget-line-item" element={<BlockBudgetLineItemPage />} />
        <Route path="/block/variance" element={<BlockBudgetVariancePage />} />
        <Route path="/block/review-phase" element={<ReviewPhasePage kinds={['BLOCK']} title="Review Phase" description="Block Budget lines currently awaiting your action at Review or Clarification. A line appears here only once it's actually routed to you." />} />
        <Route path="/block/clarification-fm" element={<ClarificationFMPage kinds={['BLOCK']} title="Clarification (FM)" description="Block Budget lines now routed to you for clarification." emptyMessage="No Block Budget lines are currently routed to you." />} />
        <Route path="/block/clarification-fo" element={<ClarificationFOPage kinds={['BLOCK']} title="Clarification (FO)" description="Block Budget lines still with Finance Officer in the clarification stage — not yet your turn." emptyMessage="No Block Budget lines are currently with Finance Officer." />} />
        <Route path="/block/approval-phase" element={<ApprovalPhasePage kinds={['BLOCK']} title="Approval Phase" description="Block Budget lines currently awaiting your approval (Reviewer 2, CIO, or Approver). A line appears here only once it's actually routed to you." />} />
        <Route path="/block/fin-supported" element={<FinSupportedPage kinds={['BLOCK']} title="FIN Supported" emptyMessage="No Block Budget lines have reached Approved yet." />} />
        <Route path="/block/inactive-users" element={<MtpInactiveUsersPage kinds={['BLOCK']} title="Block Budget with Inactive Users" description="Block Budget lines tagged to a user who is now Inactive in User Management — reassign these before they can move forward." emptyMessage="No Block Budget lines are tagged to an Inactive user." />} />
        <Route path="/finance-admin/funding" element={<FinanceAdminFundingPage />} />
        <Route path="/finance-admin/account" element={<FinanceAdminAccountPage />} />
        <Route path="/finance-admin/cost-centre" element={<FinanceAdminCostCentrePage />} />
        <Route path="/finance-admin/ict-expenditure" element={<FinanceAdminIctExpenditurePage />} />
        <Route path="/finance-admin/division" element={<FinanceAdminDivisionPage />} />
        <Route path="/finance-admin/sub-account" element={<FinanceAdminSubAccountPage />} />
        <Route path="/finance-admin/budget-period" element={<FinanceAdminBudgetPeriodPage />} />
        <Route path="/finance-admin/inflation-rate" element={<FinanceAdminInflationRatePage />} />
        <Route path="/it-admin/users" element={<UserManagementPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Layout>
  );
}
