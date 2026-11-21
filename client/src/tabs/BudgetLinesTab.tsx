import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { BudgetLineRow } from '../components/BudgetLineRow';
import { BulkReassignModal } from '../components/BulkReassignModal';
import { Button, Card, StatusBadge } from '../components/ui';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus, exerciseTypeForKind } from '../lib/budgetPeriod';
import { hasInsufficientAorBalance } from '../lib/aor';
import { periodKeys, periodSpan } from '../lib/calc';
import { isFinanceOrFinanceAdmin, isOwningBranchRep } from '../lib/workflow';
import type { AccountCode, Aor, BudgetKind, BudgetLine, BudgetPeriod, CostCentreCode, FundingEntry, FundingSource, IctExpenditureCategory, Project } from '../types';

const KIND_LABEL: Record<BudgetKind, string> = {
  MTP: 'MTP',
  BLOCK: 'Block Budget',
  RB: 'Revised Budget',
  OB: 'Original Budget',
};

export function BudgetLinesTab({ project, kind }: { project: Project; kind: BudgetKind }) {
  const { currentUser, simulationYear, simulationDate } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentreCode[]>([]);
  const [ictCategories, setIctCategories] = useState<IctExpenditureCategory[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);
  const [aors, setAors] = useState<Aor[]>([]);
  const [allObLines, setAllObLines] = useState<BudgetLine[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  function reload() {
    api.budgetLines.list(project.id, kind).then(setLines);
    api.funding.list(project.id).then(setFundingEntries);
    api.fundingCatalog.list().then(setCatalog);
    api.accountCodes.list().then(setAccountCodes);
    api.costCentres.list().then(setCostCentres);
    api.ictExpenditureCategories.list().then(setIctCategories);
    api.budgetPeriods.list().then(setBudgetPeriods);
    if (kind === 'OB') {
      api.aors.list(project.id).then(setAors);
      api.budgetLines.listAllForProject(project.id, 'OB').then(setAllObLines);
    }
  }
  // Re-fetch on user change too: which lines are visible depends on who's
  // acting (see canSeeLine), so switching users must refresh the list
  // rather than leaving the previous user's view on screen.
  useEffect(reload, [project.id, kind, currentUser?.id]);

  const isBranchRepOwner = !!currentUser && isOwningBranchRep(currentUser, project);
  const isFinance = !!currentUser && isFinanceOrFinanceAdmin(currentUser);

  const budgetPeriod = budgetPeriods.find((p) => p.type === exerciseTypeForKind(kind));
  const periodStatus = budgetPeriod ? effectiveBudgetPeriodStatus(budgetPeriod, simulationDate) : 'Draft';
  const periodEditable = !!currentUser && canActOnBudgetPeriod(periodStatus, currentUser);
  const firstPeriodLocked = kind === 'MTP' && !!budgetPeriod && budgetPeriod.status !== 'Draft';

  // MTP/Block period keys follow the global Simulation Year (top bar) rather
  // than a per-project setting, so every project is compared on the same FY
  // horizon. Existing lines keep whatever keys they were created with;
  // only the "no lines yet" fallback (and new lines) reflect the current year.
  const keys = useMemo(() => {
    if (lines.length > 0) return Object.keys(lines[0].periods);
    return periodKeys(kind, simulationYear);
  }, [lines, kind, simulationYear]);

  // Original Budget only: whether this project's Development/Operating
  // AOR fund currently has enough headroom for everything budgeted for
  // it so far — flagged red for Branch Rep attention (see lib/aor.ts).
  // Uses every OB line for the project (not just the ones this viewer
  // can see) so the check reflects the project's true total spend.
  const insufficientByLineId = useMemo(() => {
    const result = new Map<string, boolean>();
    if (kind !== 'OB') return result;
    const devSpend = allObLines.filter((l) => l.opsOrDev === 'Dev').reduce((sum, l) => sum + l.total, 0);
    const opsSpend = allObLines.filter((l) => l.opsOrDev === 'Ops').reduce((sum, l) => sum + l.total, 0);
    for (const l of lines) {
      const spend = l.opsOrDev === 'Dev' ? devSpend : l.opsOrDev === 'Ops' ? opsSpend : 0;
      result.set(l.id, hasInsufficientAorBalance(l.opsOrDev, aors, spend));
    }
    return result;
  }, [lines, aors, allObLines, kind]);

  async function addNew() {
    await api.budgetLines.create(project.id, kind, simulationYear);
    reload();
  }

  function updateLocal(updated: BudgetLine) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    // Keep the unfiltered OB total in sync too, since it isn't refetched
    // on every edit (only on reload()) — otherwise the insufficient-AOR-
    // balance check above would lag one edit behind.
    setAllObLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
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

  // Mass Submit/Approve: tick any lines, then act on all of them at once.
  // Each line is attempted independently — a mixed batch (some the current
  // user isn't actually eligible to act on) still processes whichever
  // lines succeed, reporting the rest as failures rather than blocking
  // the whole batch.
  async function massAct(action: 'submit' | 'approve') {
    setBulkError(null);
    const failures: string[] = [];
    for (const line of selectedLines) {
      try {
        const updated = action === 'submit' ? await api.budgetLines.submit(line.id) : await api.budgetLines.approve(line.id);
        updateLocal(updated);
      } catch (e) {
        failures.push(`${line.description || line.id}: ${(e as Error).message}`);
      }
    }
    setSelectedIds(new Set());
    if (failures.length > 0) setBulkError(failures.join('; '));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-700">
            {KIND_LABEL[kind]} &middot; {periodSpan(kind)} {kind === 'RB' || kind === 'OB' ? 'months' : 'years'} from{' '}
            {kind === 'RB' || kind === 'OB' ? 'Apr' : keys[0]}
          </h2>
          {budgetPeriod && budgetPeriod.status !== 'Draft' && <StatusBadge status={periodStatus} />}
        </div>
        {isBranchRepOwner && (
          <Button onClick={addNew} disabled={!periodEditable}>
            + New
          </Button>
        )}
      </div>
      {!periodEditable && (
        <p className="mb-2 text-xs text-rose-600">
          {periodStatus === 'Closed and Locked'
            ? `${KIND_LABEL[kind]} is Closed and Locked by Finance Admin — no edits until it's reopened.`
            : `${KIND_LABEL[kind]} is Closed for Submission — only Finance Officer/Finance Manager can still edit.`}
        </p>
      )}
      <p className="mb-2 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see more columns.</p>

      {selectedIds.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-indigo-100 bg-indigo-50 px-3 py-2">
          <span className="text-xs font-medium text-indigo-700">{selectedIds.size} line{selectedIds.size === 1 ? '' : 's'} selected</span>
          <Button className="!px-2 !py-1 text-xs" onClick={() => massAct('submit')}>
            Submit Selected
          </Button>
          <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={() => massAct('approve')}>
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
        <table className="w-full min-w-[1800px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2"></th>
              <th className="sticky left-[2.5rem] z-10 bg-slate-50 px-3 py-2">Status</th>
              {(kind === 'RB' || kind === 'OB') && <th className="px-2 py-2">Submission Year</th>}
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Project Title</th>
              <th className="px-2 py-2">Ops/Dev</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Sub Acct</th>
              <th className="px-2 py-2">Source of Funding</th>
              {kind === 'RB' || kind === 'OB' ? <th className="px-2 py-2">Budget Type</th> : null}
              <th className="px-2 py-2">Recurring</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2">IT Proj?</th>
              <th className="px-2 py-2">ICT Exp</th>
              <th className="px-2 py-2">Build/Buy</th>
              <th className="px-2 py-2">Basis</th>
              {(kind === 'RB' || kind === 'OB') && <th className="px-2 py-2 text-right">Approved Original Budget</th>}
              <th className="px-2 py-2 text-right">{kind === 'RB' || kind === 'OB' ? 'Total Budget Requested' : 'Total'}</th>
              {(kind === 'RB' || kind === 'OB') && <th className="px-2 py-2 text-right">Total Variance</th>}
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
              <th className="sticky right-0 z-10 bg-slate-50 px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <BudgetLineRow
                key={line.id}
                line={line}
                project={project}
                fundingEntries={fundingEntries}
                catalog={catalog}
                accountCodes={accountCodes}
                costCentres={costCentres}
                ictCategories={ictCategories}
                keys={keys}
                periodEditable={periodEditable}
                firstPeriodLocked={firstPeriodLocked}
                insufficientAorBalance={insufficientByLineId.get(line.id) ?? false}
                selected={selectedIds.has(line.id)}
                onToggleSelect={() => toggleSelect(line.id)}
                onLocalEdit={updateLocal}
                onServerUpdate={updateLocal}
                onRemoved={(id) => setLines((prev) => prev.filter((l) => l.id !== id))}
              />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={kind === 'RB' || kind === 'OB' ? 26 : 23} className="px-4 py-8 text-center text-slate-400">
                  {isFinance
                    ? `No ${KIND_LABEL[kind]} lines yet.`
                    : `No ${KIND_LABEL[kind]} lines visible to you yet — you'll see a line once you're tagged on it (assigned, reviewing, approving, or as its Finance Officer) or added as a project team member.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {!isFinance && (
        <p className="mt-2 text-xs text-slate-400">
          You only see {KIND_LABEL[kind]} lines you&rsquo;re tagged on or where you&rsquo;re a project team member.
          Finance can see every line.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Recurring lines auto-calculate later periods from the first period&rsquo;s amount (5% p.a. for IT projects,
        3% p.a. otherwise). Non-recurring lines are keyed independently per period.
      </p>
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
