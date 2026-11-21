import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, currency, inputCls, StatusBadge } from '../components/ui';
import { isFinance as isFinanceUser, isOwningBranchRep } from '../lib/workflow';
import { aorTotalApproved } from '../lib/aor';
import type { Aor, Project } from '../types';

function AorRow({
  aor,
  editable,
  canConfirm,
  onChanged,
}: {
  aor: Aor;
  editable: boolean;
  canConfirm: boolean;
  onChanged: () => void;
}) {
  const { users } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const smgtUsers = users.filter((u) => u.groups.includes('SMGT'));
  const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? id : '—');

  async function patch(data: Partial<Aor>) {
    setError(null);
    try {
      await api.aors.update(aor.id, data);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markFinanceConfirmed() {
    if (!window.confirm('Mark this AOR as Finance Confirmed? This locks every field from further edits.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.aors.confirm(aor.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = aorTotalApproved(aor);
  const cellInput = `${inputCls} w-32`;

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        {editable ? (
          <select className={cellInput} value={aor.approvedByUserId ?? ''} onChange={(e) => patch({ approvedByUserId: e.target.value || null })}>
            <option value="">—</option>
            {smgtUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : (
          nameOf(aor.approvedByUserId)
        )}
        {error && <div className="mt-1 max-w-[9rem] text-[10px] text-rose-600">{error}</div>}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <input type="date" className={cellInput} value={aor.approvedDate ?? ''} onChange={(e) => patch({ approvedDate: e.target.value || null })} />
        ) : (
          aor.approvedDate ?? '—'
        )}
      </td>
      <td className="px-3 py-2 text-right font-semibold text-slate-700">{currency(total)}</td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            type="number"
            className={`${cellInput} text-right`}
            value={aor.developmentApprovedFund}
            onChange={(e) => patch({ developmentApprovedFund: Number(e.target.value) })}
          />
        ) : (
          <span className="block text-right">{currency(aor.developmentApprovedFund)}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            type="number"
            className={`${cellInput} text-right`}
            value={aor.operatingApprovedFund}
            onChange={(e) => patch({ operatingApprovedFund: Number(e.target.value) })}
          />
        ) : (
          <span className="block text-right">{currency(aor.operatingApprovedFund)}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <input type="date" className={cellInput} value={aor.startDate ?? ''} onChange={(e) => patch({ startDate: e.target.value || null })} />
        ) : (
          aor.startDate ?? '—'
        )}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <input type="date" className={cellInput} value={aor.expiredDate ?? ''} onChange={(e) => patch({ expiredDate: e.target.value || null })} />
        ) : (
          aor.expiredDate ?? '—'
        )}
      </td>
      <td className="px-3 py-2">
        {aor.financeConfirmed ? (
          <StatusBadge status="Approved" />
        ) : canConfirm ? (
          <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={markFinanceConfirmed} disabled={busy}>
            Finance Confirmed
          </Button>
        ) : (
          <span className="text-xs text-slate-400">Not yet</span>
        )}
      </td>
    </tr>
  );
}

export function AorTab({ project }: { project: Project }) {
  const { currentUser } = useAuth();
  const [aors, setAors] = useState<Aor[]>([]);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.aors.list(project.id).then(setAors);
    api.teamMembers.list(project.id).then((members) => setIsTeamMember(!!currentUser && members.some((m) => m.userId === currentUser.id)));
  }
  useEffect(reload, [project.id, currentUser?.id]);

  const isOwner = !!currentUser && isOwningBranchRep(currentUser, project);
  const canCreateOrEdit = isOwner || isTeamMember;
  const canConfirm = !!currentUser && isFinanceUser(currentUser);

  async function addNew() {
    setError(null);
    try {
      await api.aors.create(project.id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Branch Rep keys in the AOR's details; Finance Officer or Finance Manager then marks it Finance Confirmed,
          which locks every field. A project can have more than one AOR (e.g. a later top-up).
        </p>
        {canCreateOrEdit && <Button onClick={addNew}>+ Add</Button>}
      </div>
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">AOR Approved By</th>
              <th className="px-3 py-2">AOR Approved Date</th>
              <th className="px-3 py-2 text-right">Total AOR Approved Amount</th>
              <th className="px-3 py-2">Development Approved Fund</th>
              <th className="px-3 py-2">Operating Approved Fund</th>
              <th className="px-3 py-2">AOR Start Date</th>
              <th className="px-3 py-2">AOR Expired Date</th>
              <th className="px-3 py-2">Finance Confirmed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {aors.map((aor) => (
              <AorRow key={aor.id} aor={aor} editable={canCreateOrEdit && !aor.financeConfirmed} canConfirm={canConfirm} onChanged={reload} />
            ))}
            {aors.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No AOR yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
