import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, currency, StatusBadge } from './ui';
import { canApprove, canReject, userCanAct } from '../lib/workflow';
import { ReassignPanel } from './ReassignPanel';
import type { BudgetLine, Project } from '../types';

// A row for an MTP action-queue tab (Review Phase / Approval Phase /
// Clarification (FM)'s own turn) — shows the line and, when the acting
// user can currently act on it, Approve/Reject buttons.
export function MtpActionRow({
  line,
  project,
  periodEditable,
  onUpdated,
}: {
  line: BudgetLine;
  project: Project | null;
  periodEditable: boolean;
  onUpdated: (line: BudgetLine) => void;
}) {
  const { currentUser, users } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showReassign, setShowReassign] = useState(false);
  const owner = project ? { openedByUserId: project.openedByUserId } : { openedByUserId: line.assignedToUserId };
  const canAct = (!!currentUser && userCanAct(line, currentUser, owner)) && periodEditable;
  const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? id : '—');

  async function approve() {
    setError(null);
    try {
      onUpdated(await api.budgetLines.approve(line.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reject() {
    setError(null);
    try {
      onUpdated(await api.budgetLines.reject(line.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <tr>
      <td className="px-4 py-3">
        <StatusBadge status={line.status} />
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">{line.description || '—'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{project?.title || '—'}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{line.account || '—'}</td>
      <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">{currency(line.total)}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{nameOf(line.assignedToUserId)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          {canAct && canApprove(line.step) && (
            <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={approve}>
              Approve
            </Button>
          )}
          {canAct && canReject(line.step) && (
            <Button className="!px-2 !py-1 text-xs" variant="ghost" onClick={reject}>
              Reject
            </Button>
          )}
          <Button className="!px-2 !py-1 text-xs" variant="ghost" onClick={() => setShowReassign(true)}>
            Reassign
          </Button>
        </div>
        {showReassign && (
          <ReassignPanel line={line} isAdHoc={line.projectId === null} onClose={() => setShowReassign(false)} onSaved={onUpdated} />
        )}
      </td>
    </tr>
  );
}
