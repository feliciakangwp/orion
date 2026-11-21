import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, currency, StatusBadge } from './ui';
import { canApprove, canReject, canSubmit, isEditableByBranchRep, isOwningBranchRep, userCanAct } from '../lib/workflow';
import { annualVarianceAmount, approvedOriginalBudgetOf } from '../lib/variance';
import type { AccountCode, BudgetLine, CostCentreCode, FundingEntry, FundingSource, Project, User } from '../types';

// A line's owning Branch Rep for ownership/edit checks — the real project's
// opener if it's attached to one, or whoever it's assigned to for an ad hoc
// Medium Term Projection line with no Project Profile at all. Mirrors
// `owningProjectOf` in api.ts.
function ownerOf(line: Pick<BudgetLine, 'assignedToUserId'>, project: Project | null): { openedByUserId: string } {
  return project ? { openedByUserId: project.openedByUserId } : { openedByUserId: line.assignedToUserId };
}

export function BudgetLineRow({
  line,
  project,
  fundingEntries,
  catalog,
  accountCodes,
  costCentres,
  keys,
  projectTitleEditable,
  teamProjects,
  periodEditable,
  onLocalEdit,
  onServerUpdate,
  onRemoved,
  onProjectAttach,
}: {
  line: BudgetLine;
  project: Project | null;
  fundingEntries: FundingEntry[];
  catalog: FundingSource[];
  accountCodes: AccountCode[];
  costCentres: CostCentreCode[];
  keys: string[];
  // When true (Medium Term Projection > Budget Line Item), the Project Title
  // cell is a dropdown of `teamProjects` instead of plain text, letting the
  // line be attached to / detached from a Project Profile.
  projectTitleEditable?: boolean;
  teamProjects?: Project[];
  // Whether this line's budget exercise (Budget Period, Finance Admin)
  // currently lets the acting user edit/submit/approve it at all — Closed
  // for Submission restricts this to Finance, Closed and Locked to nobody
  // but Super Admin. Computed by the parent, since it's the same check for
  // every row of a given kind.
  periodEditable: boolean;
  onLocalEdit: (line: BudgetLine) => void;
  onServerUpdate: (line: BudgetLine) => void;
  onRemoved: (id: string) => void;
  onProjectAttach?: (line: BudgetLine) => void;
}) {
  const { currentUser, users, simulationYear } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const owner = ownerOf(line, project);
  const isBranchRepOwner = !!currentUser && isOwningBranchRep(currentUser, owner);
  const editable = isBranchRepOwner && isEditableByBranchRep(line.step) && periodEditable;
  const canAct = (currentUser ? userCanAct(line, currentUser, owner) : false) && periodEditable;
  const showItFields = line.itProject === 'Yes';
  const isAnnualBudget = line.kind === 'RB' || line.kind === 'OB';

  // No department scoping: every user with the matching group is eligible.
  const reviewerOptions = users.filter((u) => u.groups.includes('DY Head') || u.groups.includes('Head'));
  const approverOptions = users.filter((u) => u.groups.includes('SMGT'));
  const finOfficerOptions = users.filter((u) => u.groups.includes('Finance Officer') || u.groups.includes('Finance Manager'));
  const nameOf = (id: string | null) => (id ? users.find((u: User) => u.id === id)?.name ?? id : '—');
  const fundingSourceNameOf = (fundingEntryId: string | null) => {
    const entry = fundingEntries.find((f) => f.id === fundingEntryId);
    const source = entry ? catalog.find((c) => c.id === entry.fundingSourceId) : undefined;
    return source?.name ?? '—';
  };

  async function patch(data: Partial<BudgetLine>) {
    setError(null);
    try {
      const updated = await api.budgetLines.update(line.id, data, simulationYear);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setPeriod(key: string, value: number) {
    await patch({ periods: { ...line.periods, [key]: value } });
  }

  async function submit() {
    setError(null);
    try {
      const updated = await api.budgetLines.submit(line.id);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function approve() {
    setError(null);
    try {
      const updated = await api.budgetLines.approve(line.id);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reject() {
    setError(null);
    try {
      const updated = await api.budgetLines.reject(line.id);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!confirm('Delete this line?')) return;
    await api.budgetLines.remove(line.id);
    onRemoved(line.id);
  }

  async function attachProject(projectId: string) {
    setError(null);
    try {
      const updated = await api.budgetLines.setProject(line.id, projectId || null);
      onServerUpdate(updated);
      onProjectAttach?.(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cellInput = 'w-28 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400';

  return (
    <tr className="align-top">
      <td className="sticky left-0 z-10 bg-white px-3 py-2">
        <StatusBadge status={line.status} />
        {error && <div className="mt-1 max-w-[10rem] text-[10px] text-rose-600">{error}</div>}
      </td>
      {isAnnualBudget && (
        <td className="px-2 py-2 text-xs text-slate-600">
          {line.submissionYear != null ? `FY${String(line.submissionYear % 100).padStart(2, '0')}` : '—'}
        </td>
      )}
      <td className="px-2 py-2">
        <textarea
          className={`${cellInput} min-h-[2.5rem] w-40`}
          value={line.description}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, description: e.target.value })}
          onBlur={(e) => patch({ description: e.target.value })}
        />
      </td>
      <td className="px-2 py-2 text-xs text-slate-600">
        {projectTitleEditable ? (
          <select
            className={`${cellInput} w-40`}
            value={project?.id ?? ''}
            disabled={!editable}
            onChange={(e) => attachProject(e.target.value)}
          >
            <option value="">(ad hoc — no Project Profile)</option>
            {(teamProjects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || '(untitled)'}
              </option>
            ))}
          </select>
        ) : (
          project?.title || '—'
        )}
      </td>
      <td className="px-2 py-2">
        <select className={cellInput} value={line.opsOrDev} disabled={!editable} onChange={(e) => patch({ opsOrDev: e.target.value as any })}>
          <option value="">—</option>
          <option value="Ops">Ops</option>
          <option value="Dev">Dev</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-36`}
          value={line.account}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, account: e.target.value })}
          onBlur={(e) => patch({ account: e.target.value })}
        >
          <option value="">—</option>
          {accountCodes
            .filter((a) => a.level === 5 && a.status === 'Active')
            .map((a) => (
              <option key={a.id} value={`${a.code} ${a.description}`}>
                {a.code} {a.description}
              </option>
            ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <input
          className={cellInput}
          value={line.subAcct}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, subAcct: e.target.value })}
          onBlur={(e) => patch({ subAcct: e.target.value })}
        />
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-36`}
          value={line.fundingEntryId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ fundingEntryId: e.target.value || null })}
        >
          <option value="">—</option>
          {fundingEntries.map((f) => (
            <option key={f.id} value={f.id}>
              {fundingSourceNameOf(f.id)}
            </option>
          ))}
        </select>
      </td>
      {line.budgetType !== null && (
        <td className="px-2 py-2">
          <select className={cellInput} value={line.budgetType} disabled>
            <option value="RB">RB</option>
            <option value="OB">OB</option>
          </select>
        </td>
      )}
      <td className="px-2 py-2">
        <select className={cellInput} value={line.recurring} disabled={!editable} onChange={(e) => patch({ recurring: e.target.value as any })}>
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-36`}
          value={line.costCentre}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, costCentre: e.target.value })}
          onBlur={(e) => patch({ costCentre: e.target.value })}
        >
          <option value="">—</option>
          {costCentres.map((c) => (
            <option key={c.id} value={`${c.code} ${c.name}`}>
              {c.code} {c.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select className={cellInput} value={line.itProject} disabled={!editable} onChange={(e) => patch({ itProject: e.target.value as any })}>
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </td>
      <td className="px-2 py-2">
        {showItFields ? (
          <input
            className={cellInput}
            value={line.ictExp}
            disabled={!editable}
            onChange={(e) => onLocalEdit({ ...line, ictExp: e.target.value })}
            onBlur={(e) => patch({ ictExp: e.target.value })}
          />
        ) : (
          <span className="text-xs text-slate-300">n/a</span>
        )}
      </td>
      <td className="px-2 py-2">
        {showItFields ? (
          <select className={cellInput} value={line.buildOrBuy} disabled={!editable} onChange={(e) => patch({ buildOrBuy: e.target.value as any })}>
            <option value="">—</option>
            <option value="Build">Build</option>
            <option value="Buy">Buy</option>
          </select>
        ) : (
          <span className="text-xs text-slate-300">n/a</span>
        )}
      </td>
      <td className="px-2 py-2">
        <input
          className={cellInput}
          value={line.basis}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, basis: e.target.value })}
          onBlur={(e) => patch({ basis: e.target.value })}
        />
      </td>
      {isAnnualBudget && (
        <>
          <td className="px-2 py-2 text-right text-xs text-slate-600">
            {line.kind === 'RB' ? currency(approvedOriginalBudgetOf(line)) : '—'}
          </td>
          <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{currency(line.total)}</td>
          <td className="px-2 py-2 text-right text-xs text-slate-600">
            {line.kind === 'RB' ? currency(annualVarianceAmount(line)) : '—'}
          </td>
        </>
      )}
      {!isAnnualBudget && <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{currency(line.total)}</td>}
      {keys.map((key, i) => {
        const lockedByRecurring = line.recurring === 'Yes' && i > 0;
        return (
          <td key={key} className="px-1 py-2">
            <input
              type="number"
              className={`${cellInput} w-24 text-right`}
              value={line.periods[key] ?? 0}
              disabled={!editable || lockedByRecurring}
              onChange={(e) => onLocalEdit({ ...line, periods: { ...line.periods, [key]: Number(e.target.value) } })}
              onBlur={(e) => setPeriod(key, Number(e.target.value))}
            />
          </td>
        );
      })}
      <td className="px-2 py-2 text-xs text-slate-600">{nameOf(line.assignedToUserId)}</td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.reviewer1UserId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ reviewer1UserId: e.target.value || null })}
        >
          <option value="">—</option>
          {reviewerOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.reviewer2UserId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ reviewer2UserId: e.target.value || null })}
        >
          <option value="">—</option>
          {reviewerOptions
            .filter((u) => u.id !== line.reviewer1UserId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.approverUserId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ approverUserId: e.target.value || null })}
        >
          <option value="">—</option>
          {approverOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.financeOfficerUserId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ financeOfficerUserId: e.target.value || null })}
        >
          <option value="">—</option>
          {finOfficerOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
      <td className="sticky right-0 z-10 whitespace-nowrap bg-white px-2 py-2">
        <div className="flex flex-col gap-1">
          {isBranchRepOwner && periodEditable && canSubmit(line.step) && (
            <Button className="!px-2 !py-1 text-xs" onClick={submit}>
              Submit
            </Button>
          )}
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
          {isBranchRepOwner && periodEditable && line.step === 'DRAFT' && (
            <Button className="!px-2 !py-1 text-xs" variant="danger" onClick={remove}>
              Delete
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
