import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency, StatusBadge } from '../components/ui';
import { aorBalances, aorTotalApproved, aorYear, monthlySpendForProject } from '../lib/aor';
import { fyKey } from '../lib/calc';
import type { Aor, BudgetLine, Project } from '../types';

// Clicking into a Project AOR row: the Year/Total/Development/Operating/
// Status summary (Status computed by running every one of the project's
// AORs, earliest Start Date first, as a waterfall against its lifetime
// Original Budget spend — see lib/aor.ts), plus the monthly "transaction"
// ledger of how much of that spend was Development vs Operating.
export function ProjectAorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { simulationDate } = useAuth();
  const [aor, setAor] = useState<Aor | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [allAors, setAllAors] = useState<Aor[]>([]);
  const [obLines, setObLines] = useState<BudgetLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.aors
      .get(id)
      .then((a) => {
        setAor(a);
        return Promise.all([api.projects.get(a.projectId), api.aors.list(a.projectId), api.budgetLines.listAllForProject(a.projectId, 'OB')]);
      })
      .then(([p, aors, lines]) => {
        setProject(p);
        setAllAors(aors);
        setObLines(lines);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const sortedAors = useMemo(
    () => [...allAors].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')),
    [allAors]
  );
  const monthlySpend = useMemo(() => monthlySpendForProject(obLines), [obLines]);
  const balances = useMemo(() => aorBalances(sortedAors, monthlySpend, simulationDate), [sortedAors, monthlySpend, simulationDate]);

  if (error) return <div className="text-rose-600">{error}</div>;
  if (!aor || !project) return <div className="text-slate-400">Loading…</div>;

  const balance = balances.get(aor.id);
  const year = aorYear(aor);

  return (
    <div>
      <Link to="/projects/aor" className="text-sm text-indigo-600 hover:underline">
        &larr; Project AOR
      </Link>
      <div className="mt-2 mb-4">
        <h1 className="text-xl font-semibold text-slate-800">{project.title || '(untitled project)'}</h1>
      </div>

      <Card className="mb-6 max-w-2xl p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Year</div>
            <div className="mt-1 text-sm text-slate-800">{year !== null ? fyKey(year) : '—'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
            <div className="mt-1">{balance ? <StatusBadge status={balance.status} /> : '—'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Approved Amount</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{currency(aorTotalApproved(aor))}</div>
          </div>
          <div />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Development Approved Amount</div>
            <div className="mt-1 text-sm text-slate-800">{currency(aor.developmentApprovedFund)}</div>
            {balance && <div className="text-xs text-slate-400">{currency(balance.developmentRemaining)} remaining</div>}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operating Approved Amount</div>
            <div className="mt-1 text-sm text-slate-800">{currency(aor.operatingApprovedFund)}</div>
            {balance && <div className="text-xs text-slate-400">{currency(balance.operatingRemaining)} remaining</div>}
          </div>
        </div>
      </Card>

      <h2 className="mb-2 text-base font-semibold text-slate-700">Monthly Transactions</h2>
      <p className="mb-3 text-xs text-slate-400">
        Every Original Budget month ever submitted for this project, split Development/Operating — this is what
        knocks off the AOR balance above.
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Development</th>
              <th className="px-4 py-3 text-right">Operating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {monthlySpend.map((m) => (
              <tr key={`${m.year}-${m.monthKey}`}>
                <td className="px-4 py-3 text-slate-700">
                  {m.monthKey} {fyKey(m.year)}
                </td>
                <td className="px-4 py-3 text-right">{currency(m.development)}</td>
                <td className="px-4 py-3 text-right">{currency(m.operating)}</td>
              </tr>
            ))}
            {monthlySpend.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  No Original Budget spend recorded for this project yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
