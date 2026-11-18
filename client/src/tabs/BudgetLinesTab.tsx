import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { BudgetLineRow } from '../components/BudgetLineRow';
import { Button, Card } from '../components/ui';
import { periodKeys, periodSpan } from '../lib/calc';
import { isFinanceOrFinanceAdmin, isOwningBranchRep } from '../lib/workflow';
import type { AccountCode, BudgetKind, BudgetLine, CostCentreCode, FundingEntry, FundingSource, Project } from '../types';

const KIND_LABEL: Record<BudgetKind, string> = {
  MTP: 'MTP',
  BLOCK: 'Block Budget',
  RB: 'Revised Budget',
  OB: 'Original Budget',
};

export function BudgetLinesTab({ project, kind }: { project: Project; kind: BudgetKind }) {
  const { currentUser, simulationYear } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentreCode[]>([]);

  function reload() {
    api.budgetLines.list(project.id, kind).then(setLines);
    api.funding.list(project.id).then(setFundingEntries);
    api.fundingCatalog.list().then(setCatalog);
    api.accountCodes.list().then(setAccountCodes);
    api.costCentres.list().then(setCostCentres);
  }
  // Re-fetch on user change too: which lines are visible depends on who's
  // acting (see canSeeLine), so switching users must refresh the list
  // rather than leaving the previous user's view on screen.
  useEffect(reload, [project.id, kind, currentUser?.id]);

  const isBranchRepOwner = !!currentUser && isOwningBranchRep(currentUser, project);
  const isFinance = !!currentUser && isFinanceOrFinanceAdmin(currentUser);

  // MTP/Block period keys follow the global Simulation Year (top bar) rather
  // than a per-project setting, so every project is compared on the same FY
  // horizon. Existing lines keep whatever keys they were created with;
  // only the "no lines yet" fallback (and new lines) reflect the current year.
  const keys = useMemo(() => {
    if (lines.length > 0) return Object.keys(lines[0].periods);
    return periodKeys(kind, simulationYear);
  }, [lines, kind, simulationYear]);

  async function addNew() {
    await api.budgetLines.create(project.id, kind, simulationYear, 'new');
    reload();
  }

  function updateLocal(updated: BudgetLine) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-700">
          {KIND_LABEL[kind]} &middot; {periodSpan(kind)} {kind === 'RB' || kind === 'OB' ? 'months' : 'years'} from{' '}
          {kind === 'RB' || kind === 'OB' ? 'Apr' : keys[0]}
        </h2>
        {isBranchRepOwner && <Button onClick={addNew}>+ New</Button>}
      </div>
      <p className="mb-2 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see more columns.</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1800px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Status</th>
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
              <th className="px-2 py-2 text-right">Total</th>
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
              <BudgetLineRow
                key={line.id}
                line={line}
                project={project}
                fundingEntries={fundingEntries}
                catalog={catalog}
                accountCodes={accountCodes}
                costCentres={costCentres}
                keys={keys}
                onLocalEdit={updateLocal}
                onServerUpdate={updateLocal}
                onRemoved={(id) => setLines((prev) => prev.filter((l) => l.id !== id))}
              />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={22} className="px-4 py-8 text-center text-slate-400">
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
    </div>
  );
}
