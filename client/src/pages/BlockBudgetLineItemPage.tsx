import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { BlockBudgetLineRow } from '../components/BlockBudgetLineRow';
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
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);

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
              <th className="px-2 py-2">Assigned to</th>
              <th className="px-2 py-2">Reviewer 1</th>
              <th className="px-2 py-2">Reviewer 2</th>
              <th className="px-2 py-2">Approver</th>
              <th className="px-2 py-2">Finance Officer</th>
              <th className="sticky right-0 z-10 bg-slate-50 px-2 py-2">Actions</th>
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
                keys={keys}
                revisedYearLabel={revisedYearLabel}
                originalYearLabel={originalYearLabel}
                projectTitleEditable
                teamProjects={teamProjects}
                periodEditable={periodEditable}
                onLocalEdit={updateLocal}
                onServerUpdate={updateLocal}
                onRemoved={(id) => setLines((prev) => prev.filter((l) => l.id !== id))}
              />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={23} className="px-4 py-8 text-center text-slate-400">
                  No Block Budget lines visible to you yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
