import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { currency, StatusBadge } from './ui';
import { isEditableByBranchRep, isOwningBranchRep } from '../lib/workflow';
import type { AccountCode, BlockBudgetLineWithReferences, CostCentreCode, FundingEntry, FundingSource, IctExpenditureCategory, Project, User } from '../types';

// A line's owning Branch Rep for ownership/edit checks — mirrors
// `ownerOf` in BudgetLineRow.tsx.
function ownerOf(line: Pick<BlockBudgetLineWithReferences, 'assignedToUserId'>, project: Project | null): { openedByUserId: string } {
  return project ? { openedByUserId: project.openedByUserId } : { openedByUserId: line.assignedToUserId };
}

// Block Budget Line Item's own row — bespoke rather than reusing
// BudgetLineRow, since its layout splices a computed Total Budget
// Requested column between two read-only reference columns (Revised
// Budget / Original Budget totals, pulled from other lines entirely) and
// its own 5 Block FY columns, which doesn't fit BudgetLineRow's generic
// "periods map, then Total" structure.
export function BlockBudgetLineRow({
  line,
  project,
  fundingEntries,
  catalog,
  accountCodes,
  costCentres,
  ictCategories,
  keys,
  revisedYearLabel,
  originalYearLabel,
  projectTitleEditable,
  teamProjects,
  periodEditable,
  selected,
  onToggleSelect,
  onLocalEdit,
  onServerUpdate,
  onProjectAttach,
}: {
  line: BlockBudgetLineWithReferences;
  project: Project | null;
  fundingEntries: FundingEntry[];
  catalog: FundingSource[];
  accountCodes: AccountCode[];
  costCentres: CostCentreCode[];
  ictCategories: IctExpenditureCategory[];
  keys: string[];
  revisedYearLabel: string;
  originalYearLabel: string;
  projectTitleEditable?: boolean;
  teamProjects?: Project[];
  periodEditable: boolean;
  // When provided, a checkbox cell is rendered first for mass
  // Submit/Approve/Reassign — selection state and the toolbar that acts
  // on it both live in the parent page.
  selected?: boolean;
  onToggleSelect?: () => void;
  onLocalEdit: (line: BlockBudgetLineWithReferences) => void;
  onServerUpdate: (line: BlockBudgetLineWithReferences) => void;
  onProjectAttach?: (line: BlockBudgetLineWithReferences) => void;
}) {
  const { currentUser, users, simulationYear } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const owner = ownerOf(line, project);
  const isBranchRepOwner = !!currentUser && isOwningBranchRep(currentUser, owner);
  const editable = isBranchRepOwner && isEditableByBranchRep(line.step) && periodEditable;
  const showItFields = line.itProject === 'Yes';

  const reviewerOptions = users.filter((u) => u.groups.includes('DY Head') || u.groups.includes('Head'));
  const approverOptions = users.filter((u) => u.groups.includes('SMGT'));
  const finOfficerOptions = users.filter((u) => u.groups.includes('Finance Officer') || u.groups.includes('Finance Manager'));
  const nameOf = (id: string | null) => (id ? users.find((u: User) => u.id === id)?.name ?? id : '—');
  const fundingSourceNameOf = (fundingEntryId: string | null) => {
    const entry = fundingEntries.find((f) => f.id === fundingEntryId);
    const source = entry ? catalog.find((c) => c.id === entry.fundingSourceId) : undefined;
    return source?.name ?? '—';
  };

  async function patch(data: Partial<BlockBudgetLineWithReferences>) {
    setError(null);
    try {
      const updated = await api.budgetLines.update(line.id, data, simulationYear);
      onServerUpdate({ ...line, ...updated });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function setPeriod(key: string, value: number) {
    await patch({ periods: { ...line.periods, [key]: value } });
  }
  async function attachProject(projectId: string) {
    setError(null);
    try {
      const updated = await api.budgetLines.setProject(line.id, projectId || null);
      onServerUpdate({ ...line, ...updated });
      onProjectAttach?.({ ...line, ...updated });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cellInput = 'w-28 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400';

  return (
    <tr className="align-top">
      <td className="sticky left-0 z-10 bg-white px-3 py-2">
        <div className="flex items-start gap-2">
          {onToggleSelect && <input type="checkbox" className="mt-0.5" checked={!!selected} onChange={onToggleSelect} />}
          <div>
            <StatusBadge status={line.status} />
            {error && <div className="mt-1 max-w-[10rem] text-[10px] text-rose-600">{error}</div>}
          </div>
        </div>
      </td>
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
          <select className={`${cellInput} w-40`} value={project?.id ?? ''} disabled={!editable} onChange={(e) => attachProject(e.target.value)}>
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
        <select className={`${cellInput} w-36`} value={line.fundingEntryId ?? ''} disabled={!editable} onChange={(e) => patch({ fundingEntryId: e.target.value || null })}>
          <option value="">—</option>
          {fundingEntries.map((f) => (
            <option key={f.id} value={f.id}>
              {fundingSourceNameOf(f.id)}
            </option>
          ))}
        </select>
      </td>
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
          <select className={cellInput} value={line.ictExp} disabled={!editable} onChange={(e) => patch({ ictExp: e.target.value })}>
            <option value="">—</option>
            {ictCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
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
      <td className="px-2 py-2 text-right text-xs text-slate-500" title={`${revisedYearLabel} Revised Budget total`}>
        {line.revisedBudgetTotal !== null ? currency(line.revisedBudgetTotal) : '—'}
      </td>
      <td className="px-2 py-2 text-right text-xs text-slate-500" title={`${originalYearLabel} Original Budget total`}>
        {line.originalBudgetTotal !== null ? currency(line.originalBudgetTotal) : '—'}
      </td>
      <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{currency(line.total)}</td>
      {keys.map((key) => (
        <td key={key} className="px-1 py-2">
          <input
            type="number"
            className={`${cellInput} w-24 text-right`}
            value={line.periods[key] ?? 0}
            disabled={!editable}
            onChange={(e) => onLocalEdit({ ...line, periods: { ...line.periods, [key]: Number(e.target.value) } })}
            onBlur={(e) => setPeriod(key, Number(e.target.value))}
          />
        </td>
      ))}
      <td className="px-2 py-2 text-xs text-slate-600">{nameOf(line.assignedToUserId)}</td>
      <td className="px-2 py-2">
        <select className={`${cellInput} w-32`} value={line.reviewer1UserId ?? ''} disabled={!editable} onChange={(e) => patch({ reviewer1UserId: e.target.value || null })}>
          <option value="">—</option>
          {reviewerOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select className={`${cellInput} w-32`} value={line.reviewer2UserId ?? ''} disabled={!editable} onChange={(e) => patch({ reviewer2UserId: e.target.value || null })}>
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
        <select className={`${cellInput} w-32`} value={line.approverUserId ?? ''} disabled={!editable} onChange={(e) => patch({ approverUserId: e.target.value || null })}>
          <option value="">—</option>
          {approverOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select className={`${cellInput} w-32`} value={line.financeOfficerUserId ?? ''} disabled={!editable} onChange={(e) => patch({ financeOfficerUserId: e.target.value || null })}>
          <option value="">—</option>
          {finOfficerOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}
