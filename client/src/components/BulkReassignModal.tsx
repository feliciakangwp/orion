import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card } from './ui';
import type { BudgetLine } from '../types';

interface DraftAssignment {
  assignedToUserId: string;
  reviewer1UserId: string;
  reviewer2UserId: string;
  approverUserId: string;
}

// Mass reassignment: tick any number of lines on a Budget Line Item /
// action-queue page, then click Reassign to see every one of them's
// current Branch Rep/Reviewer 1/Reviewer 2/Approver side by side and
// change any of them — Reviewer 2 can be cleared back to "—", which
// means the line goes straight to CIO/Approver with no Reviewer 2 at
// all (see lib/workflow.ts's nextOnApprove).
export function BulkReassignModal({
  lines,
  onClose,
  onSaved,
}: {
  lines: BudgetLine[];
  onClose: () => void;
  onSaved: (updated: BudgetLine[]) => void;
}) {
  const { users } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, DraftAssignment>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        {
          assignedToUserId: l.assignedToUserId,
          reviewer1UserId: l.reviewer1UserId ?? '',
          reviewer2UserId: l.reviewer2UserId ?? '',
          approverUserId: l.approverUserId ?? '',
        },
      ])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const branchRepOptions = users.filter((u) => u.groups.includes('Branch Rep'));
  const reviewerOptions = users.filter((u) => u.groups.includes('DY Head') || u.groups.includes('Head'));
  const approverOptions = users.filter((u) => u.groups.includes('SMGT'));

  function setField(lineId: string, field: keyof DraftAssignment, value: string) {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }));
  }

  async function saveAll() {
    setError(null);
    setSaving(true);
    const updated: BudgetLine[] = [];
    const failures: string[] = [];
    for (const line of lines) {
      const draft = drafts[line.id];
      try {
        const result = await api.budgetLines.reassign(line.id, {
          assignedToUserId: draft.assignedToUserId || undefined,
          reviewer1UserId: draft.reviewer1UserId || null,
          reviewer2UserId: draft.reviewer2UserId || null,
          approverUserId: draft.approverUserId || null,
        });
        updated.push(result);
      } catch (e) {
        failures.push(`${line.description || line.id}: ${(e as Error).message}`);
      }
    }
    setSaving(false);
    if (updated.length > 0) onSaved(updated);
    if (failures.length > 0) {
      setError(failures.join('; '));
    } else {
      onClose();
    }
  }

  const cellSelect = 'w-36 rounded border border-slate-300 px-1.5 py-1 text-xs';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-lg font-semibold text-slate-800">Reassign {lines.length} Line{lines.length === 1 ? '' : 's'}</h2>
          <p className="mt-1 text-xs text-slate-500">
            Clearing Reviewer 2 back to "—" means that line has no Reviewer 2 at all — it goes straight to CIO/Approver.
          </p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2">Branch Rep</th>
                  <th className="px-3 py-2">Reviewer 1</th>
                  <th className="px-3 py-2">Reviewer 2</th>
                  <th className="px-3 py-2">Approver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const draft = drafts[line.id];
                  const isAdHoc = line.projectId === null;
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2 text-xs text-slate-700">{line.description || '(untitled line)'}</td>
                      <td className="px-3 py-2">
                        {isAdHoc ? (
                          <select
                            className={cellSelect}
                            value={draft.assignedToUserId}
                            onChange={(e) => setField(line.id, 'assignedToUserId', e.target.value)}
                          >
                            {branchRepOptions.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400">follows Project Profile</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className={cellSelect}
                          value={draft.reviewer1UserId}
                          onChange={(e) => setField(line.id, 'reviewer1UserId', e.target.value)}
                        >
                          <option value="">—</option>
                          {reviewerOptions.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className={cellSelect}
                          value={draft.reviewer2UserId}
                          onChange={(e) => setField(line.id, 'reviewer2UserId', e.target.value)}
                        >
                          <option value="">— (no Reviewer 2)</option>
                          {reviewerOptions
                            .filter((u) => u.id !== draft.reviewer1UserId)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className={cellSelect}
                          value={draft.approverUserId}
                          onChange={(e) => setField(line.id, 'approverUserId', e.target.value)}
                        >
                          <option value="">—</option>
                          {approverOptions.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
        {error && <div className="px-4 text-sm text-rose-600">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={saveAll} disabled={saving}>
            {saving ? 'Saving…' : 'Save All'}
          </Button>
        </div>
      </div>
    </div>
  );
}
