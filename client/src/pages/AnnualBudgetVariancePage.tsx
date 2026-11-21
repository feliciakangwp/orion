import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency, StatusBadge } from '../components/ui';
import { isOwningBranchRep, isEditableByBranchRep } from '../lib/workflow';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus } from '../lib/budgetPeriod';
import { annualVarianceAmount, approvedOriginalBudgetOf } from '../lib/variance';
import type { BudgetLine, BudgetPeriod, FundingEntry, FundingSource, Project } from '../types';

function AnnualVarianceRow({
  line,
  project,
  fundingSourceName,
  periodEditable,
  onSaved,
}: {
  line: BudgetLine;
  project: Project | null;
  fundingSourceName: string;
  periodEditable: boolean;
  onSaved: (line: BudgetLine) => void;
}) {
  const { currentUser } = useAuth();
  const [draftJustification, setDraftJustification] = useState(line.justificationForVariance);
  const [error, setError] = useState<string | null>(null);
  const owner = project ? { openedByUserId: project.openedByUserId } : { openedByUserId: line.assignedToUserId };
  const isBranchRepOwner = !!currentUser && isOwningBranchRep(currentUser, owner);
  const editable = isBranchRepOwner && isEditableByBranchRep(line.step) && periodEditable;

  const approvedOriginal = approvedOriginalBudgetOf(line);
  const variance = annualVarianceAmount(line);

  async function saveJustification() {
    setError(null);
    try {
      const updated = await api.budgetLines.update(line.id, { justificationForVariance: draftJustification }, 0);
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cell = 'px-2 py-2 text-right text-xs';

  return (
    <tr className="align-top">
      <td className="sticky left-0 z-10 bg-white px-3 py-2">
        <StatusBadge status={line.status} />
      </td>
      <td className="px-2 py-2 text-xs text-slate-700">{line.description || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{project?.title || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.account || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.subAcct || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.opsOrDev || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{fundingSourceName}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.costCentre || '—'}</td>
      <td className={cell}>{currency(approvedOriginal)}</td>
      <td className={cell}>{currency(line.total)}</td>
      <td className={`${cell} font-medium text-slate-800`}>{currency(variance)}</td>
      <td className="px-2 py-2">
        <div className="flex flex-col gap-1">
          <input
            className="w-48 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400"
            value={draftJustification}
            disabled={!editable}
            onChange={(e) => setDraftJustification(e.target.value)}
            onBlur={saveJustification}
            placeholder="Justify this variance…"
          />
          {error && <span className="text-[10px] text-rose-600">{error}</span>}
        </div>
      </td>
    </tr>
  );
}

// Annual Budget > Budget Variances: every Revised Budget line whose Total
// Budget Requested currently differs from Approved Original Budget at all
// (no percentage threshold, unlike MTP Variance) — needs a Justification
// for Variance. Original Budget lines never appear here: they have no
// prior submission to compare against (see lib/variance.ts).
export function AnnualBudgetVariancePage() {
  const { currentUser, simulationDate } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);

  function reload() {
    api.budgetLines.listByKinds(['RB']).then(setLines);
    api.projects.list().then(setProjects);
    api.funding.listAll().then(setFundingEntries);
    api.fundingCatalog.list().then(setCatalog);
    api.budgetPeriods.list().then(setBudgetPeriods);
  }
  useEffect(reload, [currentUser?.id]);

  const annualPeriod = budgetPeriods.find((p) => p.type === 'ANNUAL');
  const periodStatus = annualPeriod ? effectiveBudgetPeriodStatus(annualPeriod, simulationDate) : 'Draft';
  const periodEditable = !!currentUser && canActOnBudgetPeriod(periodStatus, currentUser);

  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);
  const fundingSourceNameOf = (line: BudgetLine) => {
    const entry = fundingEntries.find((f) => f.id === line.fundingEntryId);
    const source = entry ? catalog.find((c) => c.id === entry.fundingSourceId) : undefined;
    return source?.name ?? '—';
  };

  const flaggedLines = useMemo(() => lines.filter((l) => annualVarianceAmount(l) !== 0), [lines]);

  function updateLocal(updated: BudgetLine) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-slate-800">Budget Variances</h1>
        <p className="mt-1 text-sm text-slate-500">
          Revised Budget lines whose Total Budget Requested differs at all from Approved Original Budget. Any
          nonzero variance needs a Justification for Variance.
        </p>
      </div>
      <p className="mb-2 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see more columns.</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Status</th>
              <th className="px-2 py-2">Description of Budget Item</th>
              <th className="px-2 py-2">Project Title</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Sub Account</th>
              <th className="px-2 py-2">Operating/Development</th>
              <th className="px-2 py-2">Source of Funding</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2 text-right">Approved Original Budget</th>
              <th className="px-2 py-2 text-right">Total Budget Requested</th>
              <th className="px-2 py-2 text-right">Total Variance</th>
              <th className="px-2 py-2">Justification for Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flaggedLines.map((line) => (
              <AnnualVarianceRow
                key={line.id}
                line={line}
                project={projectOf(line.projectId)}
                fundingSourceName={fundingSourceNameOf(line)}
                periodEditable={periodEditable}
                onSaved={updateLocal}
              />
            ))}
            {flaggedLines.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                  No Revised Budget lines currently have a variance.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
