import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { BudgetLineRow } from '../components/BudgetLineRow';
import { Button, Card, StatusBadge } from '../components/ui';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus } from '../lib/budgetPeriod';
import { periodKeys } from '../lib/calc';
import { canCreateProject, isOwningBranchRep } from '../lib/workflow';
import type { AccountCode, BudgetLine, BudgetPeriod, CostCentreCode, FundingEntry, FundingSource, Project } from '../types';

// Medium Term Projection > Budget Line Item: every MTP-kind line the acting
// user can see, across every Project Profile plus any ad hoc line that
// isn't tied to one at all. Attaching a Project Title here is the same
// underlying record as a project's own MTP tab, so it shows up there too.
export function BudgetLineItemPage() {
  const { currentUser, simulationYear, simulationDate } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamProjectIds, setTeamProjectIds] = useState<Set<string>>(new Set());
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentreCode[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);

  function reload() {
    api.budgetLines.listAllMtp().then(setLines);
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

  const budgetPeriod = budgetPeriods.find((p) => p.type === 'MTP');
  const periodStatus = budgetPeriod ? effectiveBudgetPeriodStatus(budgetPeriod, simulationDate) : 'Draft';
  const periodEditable = !!currentUser && canActOnBudgetPeriod(periodStatus, currentUser);
  const firstPeriodLocked = !!budgetPeriod && budgetPeriod.status !== 'Draft';

  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);

  // Projects this user can attach a line to: ones they're a team member of,
  // or that they themselves opened as Branch Rep.
  const teamProjects = useMemo(
    () =>
      projects.filter(
        (p) => teamProjectIds.has(p.id) || (!!currentUser && isOwningBranchRep(currentUser, p))
      ),
    [projects, teamProjectIds, currentUser]
  );

  const canAdd = !!currentUser && canCreateProject(currentUser);

  const keys = useMemo(() => {
    if (lines.length > 0) return Object.keys(lines[0].periods);
    return periodKeys('MTP', simulationYear);
  }, [lines, simulationYear]);

  async function addNew() {
    await api.budgetLines.createAdHoc('MTP', simulationYear, null);
    reload();
  }

  function updateLocal(updated: BudgetLine) {
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
            ? "Medium Term Projection is Closed and Locked by Finance Admin — no edits until it's reopened."
            : 'Medium Term Projection is Closed for Submission — only Finance Officer/Finance Manager can still edit.'}
        </p>
      )}
      <p className="mb-2 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see more columns.</p>
      <p className="mb-3 text-xs text-slate-400">
        Every Medium Term Projection line across all Project Profiles, plus ad hoc lines with no Project Profile. Set a
        line&rsquo;s Project Title to attach it to a project you&rsquo;re a team member of — it then also shows up on that
        project&rsquo;s own MTP tab.
      </p>

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
                project={projectOf(line.projectId)}
                fundingEntries={fundingEntries.filter((f) => f.projectId === line.projectId)}
                catalog={catalog}
                accountCodes={accountCodes}
                costCentres={costCentres}
                keys={keys}
                projectTitleEditable
                teamProjects={teamProjects}
                periodEditable={periodEditable}
                firstPeriodLocked={firstPeriodLocked}
                onLocalEdit={updateLocal}
                onServerUpdate={updateLocal}
                onRemoved={(id) => setLines((prev) => prev.filter((l) => l.id !== id))}
              />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={21} className="px-4 py-8 text-center text-slate-400">
                  No Budget Line Items visible to you yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
