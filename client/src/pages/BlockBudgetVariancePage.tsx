import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency, StatusBadge } from '../components/ui';
import { isOwningBranchRep, isEditableByBranchRep } from '../lib/workflow';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus } from '../lib/budgetPeriod';
import { fyKey } from '../lib/calc';
import { blockLineVarianceInfo, type YearVariance } from '../lib/variance';
import type { BlockBudgetLineWithReferences, BudgetPeriod, FundingEntry, FundingSource, InflationRate, Project } from '../types';

function BlockVarianceRow({
  line,
  project,
  fundingSourceName,
  periodEditable,
  rates,
  onSaved,
}: {
  line: BlockBudgetLineWithReferences;
  project: Project | null;
  fundingSourceName: string;
  periodEditable: boolean;
  rates: { nonItRate: number; itRate: number };
  onSaved: (line: BlockBudgetLineWithReferences) => void;
}) {
  const { currentUser } = useAuth();
  const [draftJustification, setDraftJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const owner = project ? { openedByUserId: project.openedByUserId } : { openedByUserId: line.assignedToUserId };
  const isBranchRepOwner = !!currentUser && isOwningBranchRep(currentUser, owner);
  const editable = isBranchRepOwner && isEditableByBranchRep(line.step) && periodEditable;

  const info = blockLineVarianceInfo(line, rates);
  const requiredKey = info.requiredJustificationKey;
  const firstKey = Object.keys(line.periods)[0];

  useEffect(() => {
    setDraftJustification(requiredKey ? line.justifications[requiredKey] ?? '' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredKey, line.id]);

  async function saveJustification() {
    if (!requiredKey) return;
    setError(null);
    try {
      const updated = await api.budgetLines.update(line.id, { justifications: { [requiredKey]: draftJustification } }, 0);
      onSaved({ ...line, ...updated });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cell = 'px-2 py-2 text-right text-xs';

  return (
    <tr className="align-top">
      <td className="sticky left-0 z-10 bg-white px-3 py-2">
        <StatusBadge status={line.status} />
        {error && <div className="mt-1 text-[10px] text-rose-600">{error}</div>}
      </td>
      <td className="px-2 py-2 text-xs text-slate-700">{line.description || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{project?.title || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.opsOrDev || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.account || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.subAcct || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{fundingSourceName}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.recurring || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.costCentre || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.itProject || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.ictExp || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.buildOrBuy || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.basis || '—'}</td>
      <td className={cell}>{line.revisedBudgetTotal !== null ? currency(line.revisedBudgetTotal) : '—'}</td>
      <td className={cell}>{line.originalBudgetTotal !== null ? currency(line.originalBudgetTotal) : '—'}</td>
      <td className={`${cell} font-semibold text-slate-700`}>{currency(line.total)}</td>
      <td className={cell}>{currency(line.periods[firstKey] ?? 0)}</td>
      {info.years.map((y: YearVariance) => {
        const isRequiredYear = y.key === requiredKey;
        return (
          <Fragment key={y.key}>
            <td className={cell}>{currency(y.current)}</td>
            <td className={`${cell} ${y.amount !== 0 ? 'font-medium text-slate-800' : 'text-slate-400'}`}>{currency(y.amount)}</td>
            <td className={cell}>{y.percent === null ? '—' : `${(y.percent * 100).toFixed(1)}%`}</td>
            <td className="px-2 py-2">
              {isRequiredYear ? (
                <input
                  className="w-40 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400"
                  value={draftJustification}
                  disabled={!editable}
                  onChange={(e) => setDraftJustification(e.target.value)}
                  onBlur={saveJustification}
                  placeholder="Justify this change…"
                />
              ) : (
                <span className="text-xs text-slate-300">n/a</span>
              )}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

// Block Budget > Budget Variance: every BLOCK line whose figures, within
// its own 5-FY window, change year-over-year by more than the Inflation
// Rate threshold for at least one consecutive pair (the window's first FY
// has nothing to compare against, so it's never flagged). Only the
// earliest flagged year needs a justification — identical mechanics to
// MTP Variance, just comparing within one line's own window instead of
// against a separate previousPeriods snapshot.
export function BlockBudgetVariancePage() {
  const { currentUser, simulationDate } = useAuth();
  const [lines, setLines] = useState<BlockBudgetLineWithReferences[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [inflationRates, setInflationRates] = useState<InflationRate[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);

  function reload() {
    api.budgetLines.listBlockBudget().then(setLines);
    api.projects.list().then(setProjects);
    api.funding.listAll().then(setFundingEntries);
    api.fundingCatalog.list().then(setCatalog);
    api.inflationRates.list().then(setInflationRates);
    api.budgetPeriods.list().then(setBudgetPeriods);
  }
  useEffect(reload, [currentUser?.id]);

  const rates = useMemo(() => {
    const nonIt = inflationRates.find((r) => r.item === 'Non IT Item')?.value ?? 3;
    const it = inflationRates.find((r) => r.item === 'IT Item')?.value ?? 5;
    return { nonItRate: nonIt / 100, itRate: it / 100 };
  }, [inflationRates]);

  const blockPeriod = budgetPeriods.find((p) => p.type === 'BLOCK');
  const periodStatus = blockPeriod ? effectiveBudgetPeriodStatus(blockPeriod, simulationDate) : 'Draft';
  const periodEditable = !!currentUser && canActOnBudgetPeriod(periodStatus, currentUser);
  const blockStartYear = blockPeriod?.blockBudgetStartYear ?? null;
  const revisedYearLabel = blockStartYear !== null ? fyKey(blockStartYear - 2) : '—';
  const originalYearLabel = blockStartYear !== null ? fyKey(blockStartYear - 1) : '—';

  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);
  const fundingSourceNameOf = (line: BlockBudgetLineWithReferences) => {
    const entry = fundingEntries.find((f) => f.id === line.fundingEntryId);
    const source = entry ? catalog.find((c) => c.id === entry.fundingSourceId) : undefined;
    return source?.name ?? '—';
  };

  const flaggedLines = useMemo(() => lines.filter((l) => blockLineVarianceInfo(l, rates).needsVarianceReview), [lines, rates]);
  const firstFyKey = flaggedLines[0] ? Object.keys(flaggedLines[0].periods)[0] : null;
  const laterYearKeys = flaggedLines[0] ? Object.keys(flaggedLines[0].periods).slice(1) : [];

  function updateLocal(updated: BlockBudgetLineWithReferences) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-slate-800">Budget Variance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Block Budget lines whose figures change year-over-year, within their own 5-FY window, by more than the
          Inflation Rate threshold (Non IT {(rates.nonItRate * 100).toFixed(1)}% / IT {(rates.itRate * 100).toFixed(1)}%)
          for at least one year. {firstFyKey ?? 'The first FY'} has nothing to compare against, so it's never
          flagged; only the earliest flagged year needs a justification.
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
              <th className="px-2 py-2">Operating/Development</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Sub Account</th>
              <th className="px-2 py-2">Source of Funding</th>
              <th className="px-2 py-2">Recurring</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2">Is It IT Project?</th>
              <th className="px-2 py-2">ICT Expenditure Category</th>
              <th className="px-2 py-2">Build vs Buy</th>
              <th className="px-2 py-2">Basis of Projection</th>
              <th className="px-2 py-2 text-right">{revisedYearLabel}</th>
              <th className="px-2 py-2 text-right">{originalYearLabel}</th>
              <th className="px-2 py-2 text-right">Total Budget Requested</th>
              <th className="px-2 py-2 text-right">{firstFyKey ?? 'First FY'}</th>
              {laterYearKeys.map((k) => (
                <Fragment key={k}>
                  <th className="px-2 py-2 text-right">{k}</th>
                  <th className="px-2 py-2 text-right">{k} Variance Amount</th>
                  <th className="px-2 py-2 text-right">{k} Variance %</th>
                  <th className="px-2 py-2">{k} Variance Justification</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flaggedLines.map((line) => (
              <BlockVarianceRow
                key={line.id}
                line={line}
                project={projectOf(line.projectId)}
                fundingSourceName={fundingSourceNameOf(line)}
                periodEditable={periodEditable}
                rates={rates}
                onSaved={updateLocal}
              />
            ))}
            {flaggedLines.length === 0 && (
              <tr>
                <td colSpan={17} className="px-4 py-8 text-center text-slate-400">
                  No Block Budget lines currently exceed the variance threshold.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
