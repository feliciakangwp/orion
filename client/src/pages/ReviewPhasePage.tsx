import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card } from '../components/ui';
import { MtpActionRow } from '../components/MtpActionRow';
import { BulkReassignModal } from '../components/BulkReassignModal';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus, exerciseTypeForKind } from '../lib/budgetPeriod';
import type { BudgetKind, BudgetLine, BudgetPeriod, Project } from '../types';

// Every line of the given kind(s) currently requiring the acting user's
// action at the Review or Clarification stage (Reviewer 1; Finance Officer
// or Finance Manager during Clarification; or the Branch Rep clarifying a
// Finance Officer reject). A line only shows up here the moment it's
// actually theirs to act on, not before. Reused by both Medium Term
// Projection (kinds=['MTP']) and Annual Budget (kinds=['RB','OB']).
export function ReviewPhasePage({
  kinds = ['MTP'],
  title = 'Review Phase',
  description = "MTP lines currently awaiting your action at Review or Clarification. A line appears here only once it's actually routed to you.",
}: {
  kinds?: BudgetKind[];
  title?: string;
  description?: string;
}) {
  const { currentUser, simulationDate } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

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
  const rows = lines.filter((l) => l.status === 'Review' || l.status === 'Clarification');

  function updateLocal(updated: BudgetLine) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedLines = rows.filter((l) => selectedIds.has(l.id));

  async function approveSelected() {
    setBulkError(null);
    const failures: string[] = [];
    for (const line of selectedLines) {
      try {
        updateLocal(await api.budgetLines.approve(line.id));
      } catch (e) {
        failures.push(`${line.description || line.id}: ${(e as Error).message}`);
      }
    }
    setSelectedIds(new Set());
    if (failures.length > 0) setBulkError(failures.join('; '));
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {selectedIds.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-indigo-100 bg-indigo-50 px-3 py-2">
          <span className="text-xs font-medium text-indigo-700">{selectedIds.size} line{selectedIds.size === 1 ? '' : 's'} selected</span>
          <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={approveSelected}>
            Approve Selected
          </Button>
          <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={() => setShowBulkReassign(true)}>
            Reassign Selected
          </Button>
          <Button className="!px-2 !py-1 text-xs" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}
      {bulkError && <p className="mb-2 text-xs text-rose-600">{bulkError}</p>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Branch Rep</th>
              <th className="px-4 py-3">Reviewer 1</th>
              <th className="px-4 py-3">Reviewer 2</th>
              <th className="px-4 py-3">Approver</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((line) => (
              <MtpActionRow
                key={line.id}
                line={line}
                project={projectOf(line.projectId)}
                periodEditable={periodEditable}
                selected={selectedIds.has(line.id)}
                onToggleSelect={() => toggleSelect(line.id)}
                onUpdated={updateLocal}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                  Nothing awaiting your action right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {showBulkReassign && (
        <BulkReassignModal
          lines={selectedLines}
          onClose={() => setShowBulkReassign(false)}
          onSaved={(updated) => {
            updated.forEach(updateLocal);
            setSelectedIds(new Set());
            setShowBulkReassign(false);
          }}
        />
      )}
    </div>
  );
}
