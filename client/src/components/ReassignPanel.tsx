import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, inputCls } from './ui';
import type { BudgetLine } from '../types';

// Lets anyone who can currently see a line change who it's assigned to —
// Branch Rep (ad hoc lines only; a project-attached line's Branch Rep
// always follows the Project Profile's own opener), Reviewer 1, Reviewer
// 2, or Approver — regardless of the line's current workflow step.
// Reassigning yourself away means you naturally stop seeing the line
// afterward (see canSeeLine), which is the point.
export function ReassignPanel({
  line,
  isAdHoc,
  onClose,
  onSaved,
}: {
  line: BudgetLine;
  isAdHoc: boolean;
  onClose: () => void;
  onSaved: (line: BudgetLine) => void;
}) {
  const { users } = useAuth();
  const [assignedToUserId, setAssignedToUserId] = useState(line.assignedToUserId);
  const [reviewer1UserId, setReviewer1UserId] = useState(line.reviewer1UserId ?? '');
  const [reviewer2UserId, setReviewer2UserId] = useState(line.reviewer2UserId ?? '');
  const [approverUserId, setApproverUserId] = useState(line.approverUserId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const branchRepOptions = users.filter((u) => u.groups.includes('Branch Rep'));
  const reviewerOptions = users.filter((u) => u.groups.includes('DY Head') || u.groups.includes('Head'));
  const approverOptions = users.filter((u) => u.groups.includes('SMGT'));

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const updated = await api.budgetLines.reassign(line.id, {
        ...(isAdHoc ? { assignedToUserId } : {}),
        reviewer1UserId: reviewer1UserId || null,
        reviewer2UserId: reviewer2UserId || null,
        approverUserId: approverUserId || null,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800">Reassign Line</h2>
        <p className="mt-1 text-xs text-slate-500">Change who this line is assigned to — you'll stop seeing it if you reassign yourself away.</p>

        <div className="mt-4 flex flex-col gap-3">
          {isAdHoc && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Branch Rep</span>
              <select className={inputCls} value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
                {branchRepOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reviewer 1</span>
            <select className={inputCls} value={reviewer1UserId} onChange={(e) => setReviewer1UserId(e.target.value)}>
              <option value="">—</option>
              {reviewerOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reviewer 2</span>
            <select className={inputCls} value={reviewer2UserId} onChange={(e) => setReviewer2UserId(e.target.value)}>
              <option value="">—</option>
              {reviewerOptions
                .filter((u) => u.id !== reviewer1UserId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approver</span>
            <select className={inputCls} value={approverUserId} onChange={(e) => setApproverUserId(e.target.value)}>
              <option value="">—</option>
              {approverOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
