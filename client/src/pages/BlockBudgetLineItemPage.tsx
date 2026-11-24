import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { BlockBudgetLineRow } from '../components/BlockBudgetLineRow';
import { BulkReassignModal } from '../components/BulkReassignModal';
import { Button, Card, StatusBadge } from '../components/ui';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus } from '../lib/budgetPeriod';
import { fyKey, periodKeys } from '../lib/calc';
import { canCreateProject, isOwningBranchRep } from '../lib/workflow';
import type {
  AccountCode,
  BlockBudgetLineWithReferences,
  BudgetPeriod,
  CostCentreCode,
  FundingEntry,
  FundingSource,
  IctExpenditureCategory,
  Project,
} from '../types';

// Block Budget > Budget Line Item: every BLOCK-kind line the acting user
// can see, across every Project Profile plus any ad hoc line. Its 5 FY
// columns come straight from Medium Term Projection at rollover (see
// rollBlockBudgetForward in api.ts); the two reference columns ahead of
// Total Budget Requested show that same line's Revised/Original Budget
// totals (2 and 1 years before the Block Budget Start Year) for context —
// they're never part of the line's own total.
export function BlockBudgetLineItemPage() {
  const { currentUser, simulationYear, simulationDate } = useAuth();
  const [lines, setLines] = useState<BlockBudgetLineWithReferences[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamProjectIds, setTeamProjectIds] = useState<Set<string>>(new Set());
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentreCode[]>([]);
  const [ictCategories, setIctCategories] = useState<IctExpenditureCategory[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  function reload() {
    api.budgetLines.listBlockBudget().then(setLines);
    api.projects.list().then(setProjects);
    if (currentUser) {
      api.teamMembers.listForUser(currentUser.id).then((members) => setTeamProjectIds(new Set(members.map((m) => m.projectId))));
    }
    api.funding.listAll().then(setFundingEntries);
    api.fundingCatalog.list().then(setCatalog);
    api.accountCodes.list().then(setAccountCodes);
    api.costCentres.list().then(setCostCentres);
    api.ictExpenditureCategories.list().then(setIctCategories);
    api.budgetPeriods.list().then(setBudgetPeriods);
  }
  useEffect(reload, [currentUser?.id]);

  const budgetPeriod = budgetPeriods.find((p) => p.type === 'BLOCK');
  const periodStatus = budgetPeriod ? effectiveBudgetPeriodStatus(budgetPeriod, simulationDate) : 'Draft';
  const periodEditable = !!currentUser && canActOnBudgetPeriod(periodStatus, currentUser);
  const blockStartYear = budgetPeriod?.blockBudgetStartYear ?? null;
  const revisedYearLabel = blockStartYear !== null ? fyKey(blockStartYear - 2) : '—';
  const originalYearLabel = blockStartYear !== null ? fyKey(blockStartYear - 1) : '—';

  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);

  const teamProjects = useMemo(
    () => projects.filter((p) => teamProjectIds.has(p.id) || (!!currentUser && isOwningBranchRep(currentUser, p))),
    [projects, teamProjectIds, currentUser]
  );

  const canAdd = !!currentUser && canCreateProject(currentUser);

  const keys = useMemo(() => {
    if (lines.length > 0) return Object.keys(lines[0].periods);
    if (blockStartYear !== null) return periodKeys('BLOCK', blockStartYear);
    return periodKeys('BLOCK', simulationYear);
  }, [lines, blockStartYear, simulationYear]);

  async function addNew() {
    await api.budgetLines.createAdHoc('BLOCK', blockStartYear ?? simulationYear, null);
    reload();
  }

  function updateLocal(updated: BlockBudgetLineWithReferences) {
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

  const selectedLines = lines.filter((l) => selectedIds.has(l.id));

  async function massAct(action: 'submit' | 'approve' | 'reject' | 'delete') {
    setBulkError(null);
    const failures: string[] = [];
    const deletedIds: string[] = [];
    for (const line of selectedLines) {
      try {
        if (action === 'delete') {
          await api.budgetLines.remove(line.id);
          deletedIds.push(line.id);
        } else {
          const updated =
            action === 'submit' ? await api.budgetLines.submit(line.id) : action === 'approve' ? await api.budgetLines.approve(line.id) : await api.budgetLines.reject(line.id);
          updateLocal({ ...line, ...updated });
        }
      } catch (e) {
        failures.push(`${line.description || line.id}: ${(e as Error).message}`);
      }
    }
    if (deletedIds.length > 0) {
      const deleted = new Set(deletedIds);
      setLines((prev) => prev.filter((l) => !deleted.has(l.id)));
    }
    setSelectedIds(new Set());
    if (failures.length > 0) setBulkError(failures.join('; '));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-800">Budget Line Item</h1>
          {budgetPeriod && budgetPeriod.status !== 'Draft' && <StatusBadge status={periodStatus} />}
        </div>
        {canAdd && (
          <Button onClick={addNew} disabled={!periodEditable}>
            + Add
          </Button>
        )}
      </div>
      {!periodEditable && (
        <p className="mb-2 text-xs text-rose-600">
          {periodStatus === 'Closed and Locked'
            ? "Block Budget is Closed and Locked by Finance Admin — no edits until it's reopened."
            : 'Block Budget is Closed for Submission — only Finance Officer/Finance Manager can still edit.'}
        </p>
      )}
      <p className="mb-2 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see more columns.</p>
      <p className="mb-3 text-xs text-slate-400">
        Every Block Budget line across all Project Profiles, plus ad hoc lines. {revisedYearLabel}/{originalYearLabel}{' '}
        are read-only reference totals pulled from that line&rsquo;s Revised/Original Budget — Total Budget Requested
        is only the sum of its own {keys.length} Block FYs.
      </p>

      {selectedIds.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-indigo-100 bg-indigo-50 px-3 py-2">
          <span className="text-xs font-medium text-indigo-700">{selectedIds.size} line{selectedIds.size === 1 ? '' : 's'} selected</span>
          <Button className="!px-2 !py-1 text-xs" onClick={() => massAct('submit')}>
            Submit Selected
          </Button>
          <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={() => massAct('approve')}>
            Approve Selected
          </Button>
          <Button className="!px-2 !py-1 text-xs" variant="ghost" onClick={() => massAct('reject')}>
            Reject Selected
          </Button>
          <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={() => setShowBulkReassign(true)}>
            Reassign Selected
          </Button>
          <Button
            className="!px-2 !py-1 text-xs"
            variant="danger"
            onClick={() => {
              if (confirm(`Delete ${selectedIds.size} line${selectedIds.size === 1 ? '' : 's'}? Only lines still marked New can actually be removed.`)) {
                massAct('delete');
              }
            }}
          >
            Delete Selected
          </Button>
          <Button className="!px-2 !py-1 text-xs" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}
      {bulkError && <p className="mb-2 text-xs text-rose-600">{bulkError}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1900px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Status</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Project Title</th>
              <th className="px-2 py-2">Ops/Dev</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Sub Acct</th>
              <th className="px-2 py-2">Source of Funding</th>
              <th className="px-2 py-2">Recurring</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2">IT Proj?</th>
              <th className="px-2 py-2">ICT Exp</th>
              <th className="px-2 py-2">Build/Buy</th>
              <th className="px-2 py-2">Basis</th>
              <th className="px-2 py-2 text-right">{revisedYearLabel}</th>
              <th className="px-2 py-2 text-right">{originalYearLabel}</th>
              <th className="px-2 py-2 text-right">Total Budget Requested</th>
              {keys.map((k) => (
                <th key={k} className="px-1 py-2 text-right">
                  {k}
                </th>
              ))}
              <th className="px-2 py-2">Branch Rep</th>
              <th className="px-2 py-2">Reviewer 1</th>
              <th className="px-2 py-2">Reviewer 2</th>
              <th className="px-2 py-2">Approver</th>
              <th className="px-2 py-2">Finance Officer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <BlockBudgetLineRow
                key={line.id}
                line={line}
                project={projectOf(line.projectId)}
                fundingEntries={fundingEntries.filter((f) => f.projectId === line.projectId)}
                catalog={catalog}
                accountCodes={accountCodes}
                costCentres={costCentres}
                ictCategories={ictCategories}
                keys={keys}
                revisedYearLabel={revisedYearLabel}
                originalYearLabel={originalYearLabel}
                projectTitleEditable
                teamProjects={teamProjects}
                periodEditable={periodEditable}
                selected={selectedIds.has(line.id)}
                onToggleSelect={() => toggleSelect(line.id)}
                onLocalEdit={updateLocal}
                onServerUpdate={updateLocal}
              />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={22} className="px-4 py-8 text-center text-slate-400">
                  No Block Budget lines visible to you yet.
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
            updated.forEach((u) => {
              const existing = lines.find((l) => l.id === u.id);
              updateLocal({ ...(existing ?? (u as BlockBudgetLineWithReferences)), ...u });
            });
            setSelectedIds(new Set());
            setShowBulkReassign(false);
          }}
        />
      )}
    </div>
  );
}
