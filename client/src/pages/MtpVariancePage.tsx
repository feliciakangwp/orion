import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency, StatusBadge } from '../components/ui';
import { isOwningBranchRep, isEditableByBranchRep } from '../lib/workflow';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus } from '../lib/budgetPeriod';
import { lineVarianceInfo, type YearVariance } from '../lib/variance';
import type { BudgetLine, BudgetPeriod, FundingEntry, FundingSource, InflationRate, Project } from '../types';

function VarianceRow({
  line,
  project,
  fundingSourceName,
  periodEditable,
  rates,
  onSaved,
}: {
  line: BudgetLine;
  project: Project | null;
  fundingSourceName: string;
  periodEditable: boolean;
  rates: { nonItRate: number; itRate: number };
  onSaved: (line: BudgetLine) => void;
}) {
  const { currentUser } = useAuth();
  const [draftJustification, setDraftJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const owner = project ? { openedByUserId: project.openedByUserId } : { openedByUserId: line.assignedToUserId };
  const isBranchRepOwner = !!currentUser && isOwningBranchRep(currentUser, owner);
  const editable = isBranchRepOwner && isEditableByBranchRep(line.step) && periodEditable;

  const info = lineVarianceInfo(line, rates);
  const requiredKey = info.requiredJustificationKey;
  const justificationProvided = requiredKey ? !!line.justifications[requiredKey]?.trim() : false;

  useEffect(() => {
    setDraftJustification(requiredKey ? line.justifications[requiredKey] ?? '' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredKey, line.id]);

  async function saveJustification() {
    if (!requiredKey) return;
    setError(null);
    try {
      const updated = await api.budgetLines.update(line.id, { justifications: { [requiredKey]: draftJustification } }, 0);
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
      <td className="px-2 py-2">
        <StatusBadge status={requiredKey ? (justificationProvided ? 'Provided' : 'Required') : '—'} />
      </td>
      <td className="px-2 py-2 text-xs text-slate-700">{line.description || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.account || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.subAcct || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.opsOrDev || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{fundingSourceName}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.costCentre || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{project?.title || '—'}</td>
      {info.years.map((y: YearVariance) => {
        const isRequiredYear = y.key === requiredKey;
        return (
          <Fragment key={y.key}>
            <td className={cell}>
              {currency(y.previous)}
            </td>
            <td className={cell}>
              {currency(y.current)}
            </td>
            <td className={`${cell} ${y.amount !== 0 ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
              {currency(y.amount)}
            </td>
            <td className={cell}>
              {y.percent === null ? '—' : `${(y.percent * 100).toFixed(1)}%`}
            </td>
            <td className="px-2 py-2">
              {isRequiredYear ? (
                <div className="flex flex-col gap-1">
                  <input
                    className="w-40 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400"
                    value={draftJustification}
                    disabled={!editable}
                    onChange={(e) => setDraftJustification(e.target.value)}
                    onBlur={saveJustification}
                    placeholder="Justify this change…"
                  />
                  {error && <span className="text-[10px] text-rose-600">{error}</span>}
                </div>
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

// Medium Term Projection > MTP Variance: every MTP line whose current
// figures have diverged from last FY's by more than the Inflation Rate
// threshold for at least one year. The earliest such year needs a
// justification; later flagged years don't need their own.
export function MtpVariancePage() {
  const { currentUser, simulationDate } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [inflationRates, setInflationRates] = useState<InflationRate[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriod[]>([]);

  function reload() {
    api.budgetLines.listAllMtp().then(setLines);
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

  const mtpPeriod = budgetPeriods.find((p) => p.type === 'MTP');
  const periodStatus = mtpPeriod ? effectiveBudgetPeriodStatus(mtpPeriod, simulationDate) : 'Draft';
  const periodEditable = !!currentUser && canActOnBudgetPeriod(periodStatus, currentUser);

  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);
  const fundingSourceNameOf = (line: BudgetLine) => {
    const entry = fundingEntries.find((f) => f.id === line.fundingEntryId);
    const source = entry ? catalog.find((c) => c.id === entry.fundingSourceId) : undefined;
    return source?.name ?? '—';
  };

  const flaggedLines = useMemo(
    () => lines.filter((l) => lineVarianceInfo(l, rates).needsVarianceReview),
    [lines, rates]
  );
  const yearKeys = flaggedLines[0] ? Object.keys(flaggedLines[0].periods) : [];

  function updateLocal(updated: BudgetLine) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-slate-800">MTP Variance</h1>
        <p className="mt-1 text-sm text-slate-500">
          MTP lines whose figures have changed from last FY&rsquo;s submission by more than the Inflation Rate
          threshold (Non IT {(rates.nonItRate * 100).toFixed(1)}% / IT {(rates.itRate * 100).toFixed(1)}%) for at
          least one year. Only the earliest such year needs a justification.
        </p>
      </div>
      <p className="mb-2 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see more columns.</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Status</th>
              <th className="px-2 py-2">Justification</th>
              <th className="px-2 py-2">Description of Budget Item</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Sub Account</th>
              <th className="px-2 py-2">Operating/Development</th>
              <th className="px-2 py-2">Source of Funding</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2">Project Title</th>
              {yearKeys.map((k) => (
                <Fragment key={k}>
                  <th className="px-2 py-2 text-right">{k} (Previous)</th>
                  <th className="px-2 py-2 text-right">{k}</th>
                  <th className="px-2 py-2 text-right">{k} Variance Amount</th>
                  <th className="px-2 py-2 text-right">{k} Variance %</th>
                  <th className="px-2 py-2">{k} Justification</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flaggedLines.map((line) => (
              <VarianceRow
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
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No MTP lines currently exceed the variance threshold.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
