import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card } from '../components/ui';
import { MtpActionRow } from '../components/MtpActionRow';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus, exerciseTypeForKind } from '../lib/budgetPeriod';
import type { BudgetKind, BudgetLine, BudgetPeriod, Project } from '../types';

// Every line of the given kind(s) currently requiring the acting user's
// action at Pending Approval (Reviewer 2, CIO for an IT project, or
// Approver otherwise). A line only appears for, say, the Approver once
// it's actually been routed to her — not while it's still with Reviewer 2
// or CIO. Reused by both Medium Term Projection (kinds=['MTP']) and Annual
// Budget (kinds=['RB','OB']).
export function ApprovalPhasePage({
  kinds = ['MTP'],
  title = 'Approval Phase',
  description = "MTP lines currently awaiting your approval (Reviewer 2, CIO, or Approver). A line appears here only once it's actually routed to you.",
}: {
  kinds?: BudgetKind[];
  title?: string;
  description?: string;
}) {
  const { currentUser, simulationDate } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);

  function reload() {
    api.budgetLines.listActionQueue(kinds).then(setLines);
    api.projects.list().then(setProjects);
    api.budgetPeriods.list().then(setBudgetPeriods);
  }
  useEffect(reload, [currentUser?.id, kinds.join(',')]);

  const exerciseType = exerciseTypeForKind(kinds[0]);
  const period = budgetPeriods.find((p) => p.type === exerciseType);
  const periodStatus = period ? effectiveBudgetPeriodStatus(period, simulationDate) : 'Draft';
  const periodEditable = !!currentUser && canActOnBudgetPeriod(periodStatus, currentUser);

  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);
  const rows = lines.filter((l) => l.status === 'Pending Approval');

  function updateLocal(updated: BudgetLine) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Assigned to</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((line) => (
              <MtpActionRow key={line.id} line={line} project={projectOf(line.projectId)} periodEditable={periodEditable} onUpdated={updateLocal} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Nothing awaiting your approval right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
