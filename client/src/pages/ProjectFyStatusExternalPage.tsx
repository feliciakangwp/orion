import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import { fyKey } from '../lib/calc';
import type { ExternalProjectFyStatus } from '../api';

// Project FY Status (External): every Project Profile with at least one
// Approved, External Source of Funding entry, tracked against this FY's
// Annual Budget cycle — FY Original Budget and FY Revised Budget are each
// that project's own budget lines for the OB/RB year the Annual Budget
// period is currently on (see computeExternalProjectFyStatuses in api.ts).
// Finance Officer/Finance Manager use this to see which projects have
// Excess (can lend) and which have Deficit (need to borrow) — see Project
// Loan Pot.
function ProjectFyStatusExternalContent() {
  const { currentUser } = useAuth();
  const [rows, setRows] = useState<ExternalProjectFyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    api.projectFyStatus
      .list()
      .then((r: ExternalProjectFyStatus[]) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, [currentUser?.id]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Project FY Status (External)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Projects with an Approved, External Source of Funding, with this FY's Original Budget compared to this
          FY's Revised Budget. Balanced means the two match; Deficit means Revised Budget is higher (the project is
          short); Excess means Original Budget is higher (the project has room to lend — see Project Loan Pot).
        </p>
      </div>
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Project Title</th>
              <th className="px-3 py-2">Current Status</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">FY Original Budget</th>
              <th className="px-3 py-2 text-right">FY Revised Budget</th>
              <th className="px-3 py-2 text-right">Differences</th>
              <th className="px-3 py-2 text-right">Total Loan Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.project.id}>
                <td className="px-3 py-2 text-sm text-slate-700">
                  {row.project.title} <span className="text-xs text-slate-400">({fyKey(row.fy)})</span>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.project.status} />
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 text-right text-sm text-slate-700">{currency(row.fyOriginalBudget)}</td>
                <td className="px-3 py-2 text-right text-sm text-slate-700">{currency(row.fyRevisedBudget)}</td>
                <td
                  className={`px-3 py-2 text-right text-sm font-medium ${
                    row.difference < 0 ? 'text-rose-600' : row.difference > 0 ? 'text-emerald-600' : 'text-slate-700'
                  }`}
                >
                  {currency(row.difference)}
                </td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">{currency(row.totalLoanAmount)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No projects with an Approved, External Source of Funding yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function ProjectFyStatusExternalPage() {
  return (
    <RequireGroup group={['Finance Officer', 'Finance Manager']}>
      <ProjectFyStatusExternalContent />
    </RequireGroup>
  );
}
