import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ExternalProjectFyStatus } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, currency, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import { NewLoanPotModal } from '../components/NewLoanPotModal';
import { fyKey } from '../lib/calc';
import type { LoanPot, Project } from '../types';

// Project Loan Pot: Finance Officer/Finance Manager lend budget room from a
// project currently showing Excess to one showing Deficit (see Project FY
// Status (External)). Creating a loan immediately books the repayment —
// see api.loanPots.create() — so "Closed" here just marks a loan as
// settled; it doesn't gate anything else.
function ProjectLoanPotContent() {
  const { currentUser } = useAuth();
  const [loans, setLoans] = useState<LoanPot[]>([]);
  const [statuses, setStatuses] = useState<ExternalProjectFyStatus[]>([]);
  const [projectsById, setProjectsById] = useState<Map<string, Project>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  function reload() {
    setLoading(true);
    Promise.all([api.loanPots.list(), api.projectFyStatus.list(), api.projects.list()])
      .then(([loanRows, statusRows, projects]: [LoanPot[], ExternalProjectFyStatus[], Project[]]) => {
        setLoans(loanRows);
        setStatuses(statusRows);
        setProjectsById(new Map(projects.map((p) => [p.id, p])));
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, [currentUser?.id]);

  async function closeLoan(id: string) {
    setError(null);
    try {
      await api.loanPots.close(id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function projectTitle(id: string): string {
    return projectsById.get(id)?.title ?? '—';
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Project Loan Pot</h1>
          <p className="mt-1 text-sm text-slate-500">
            Loans of budget room between projects with an Approved, External Source of Funding — see Project FY
            Status (External) for which projects can lend (Excess) or need to borrow (Deficit).
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>New</Button>
      </div>
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">FY</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Loan From</th>
              <th className="px-3 py-2">Loan To</th>
              <th className="px-3 py-2 text-right">Loan Amount</th>
              <th className="px-3 py-2">Return Booked</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loans.map((loan) => (
              <tr key={loan.id}>
                <td className="px-3 py-2 text-sm text-slate-700">{fyKey(loan.fy)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={loan.status} />
                </td>
                <td className="px-3 py-2 text-sm text-slate-700">{projectTitle(loan.loanFromProjectId)}</td>
                <td className="px-3 py-2 text-sm text-slate-700">{projectTitle(loan.loanToProjectId)}</td>
                <td className="px-3 py-2 text-right text-sm font-medium text-slate-700">{currency(loan.loanAmount)}</td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {loan.returnLineCreated ? `Yes (${fyKey(loan.returnFy)} Original Budget)` : 'No'}
                </td>
                <td className="px-3 py-2 text-right">
                  {loan.status === 'Open' && (
                    <Button variant="secondary" onClick={() => closeLoan(loan.id)}>
                      Close
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && loans.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No loans yet — click New to lend budget room from a project with Excess to one with Deficit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {showNew && (
        <NewLoanPotModal
          statuses={statuses}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

export function ProjectLoanPotPage() {
  return (
    <RequireGroup group={['Finance Officer', 'Finance Manager']}>
      <ProjectLoanPotContent />
    </RequireGroup>
  );
}
