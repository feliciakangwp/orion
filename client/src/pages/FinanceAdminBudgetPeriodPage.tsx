import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, inputCls, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import { effectiveBudgetPeriodStatus, EXERCISE_LABEL } from '../lib/budgetPeriod';
import { fyOfDate } from '../lib/calc';
import { BUDGET_EXERCISE_TYPES } from '../types';
import type { BudgetExerciseType, BudgetPeriod } from '../types';

function ExerciseCard({ period, onChanged }: { period: BudgetPeriod; onChanged: () => void }) {
  const { simulationDate, simulationYear, setSimulationYear } = useAuth();
  const [startDate, setStartDate] = useState(period.startDate ?? '');
  const [endDate, setEndDate] = useState(period.endDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStartDate(period.startDate ?? '');
    setEndDate(period.endDate ?? '');
  }, [period.startDate, period.endDate]);

  const status = effectiveBudgetPeriodStatus(period, simulationDate);
  const startLocked = period.status !== 'Draft';
  // End Date is editable while Draft (same as Start Date) or Open with its
  // deadline not yet passed; once Closed for Submission (or Locked), it's
  // frozen too.
  const endLocked = status === 'Closed for Submission' || status === 'Closed and Locked';

  async function open() {
    setError(null);
    setBusy(true);
    try {
      await api.budgetPeriods.open(period.type, startDate, endDate);
      // Medium Term Projection's 15-year window follows the new period's
      // start FY, so the global Simulation Year control (used for new
      // lines and the "no lines yet" header) tracks it too.
      if (period.type === 'MTP') {
        const fy = fyOfDate(startDate);
        if (fy !== simulationYear) setSimulationYear(fy);
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEndDate() {
    setError(null);
    setBusy(true);
    try {
      await api.budgetPeriods.updateEndDate(period.type, endDate);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (!confirm(`Close and Lock ${EXERCISE_LABEL[period.type]}? Finance Officer and Finance Manager will no longer be able to edit its lines until Finance Admin reopens it.`)) return;
    setError(null);
    setBusy(true);
    try {
      await api.budgetPeriods.lock(period.type);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setError(null);
    setBusy(true);
    try {
      await api.budgetPeriods.reopen(period.type);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetToDraft() {
    if (!confirm(`Reset ${EXERCISE_LABEL[period.type]} back to Draft? This clears its Start/End Date so a new cycle can be opened (for this exercise, or a different one).`)) return;
    setError(null);
    setBusy(true);
    try {
      await api.budgetPeriods.resetToDraft(period.type);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const endDateDirty = endDate !== (period.endDate ?? '');

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800">{EXERCISE_LABEL[period.type]}</h2>
        <StatusBadge status={status} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start Date</span>
          <input
            type="date"
            className={inputCls}
            value={startDate}
            disabled={startLocked}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">End Date</span>
          <input
            type="date"
            className={inputCls}
            value={endDate}
            disabled={endLocked}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {period.status === 'Draft' && (
          <Button onClick={open} disabled={busy || !startDate || !endDate}>
            Open
          </Button>
        )}
        {status === 'Open' && endDateDirty && (
          <Button variant="secondary" onClick={saveEndDate} disabled={busy}>
            Save End Date
          </Button>
        )}
        {(status === 'Open' || status === 'Closed for Submission') && (
          <Button variant="secondary" onClick={lock} disabled={busy}>
            Closed and Lock
          </Button>
        )}
        {status === 'Closed and Locked' && (
          <>
            <Button variant="secondary" onClick={reopen} disabled={busy}>
              Reopen
            </Button>
            <Button variant="danger" onClick={resetToDraft} disabled={busy}>
              Reset to Draft
            </Button>
          </>
        )}
      </div>

      {period.type === 'MTP' && period.status === 'Draft' && (
        <p className="mt-3 text-xs text-slate-400">
          Opening Medium Term Projection rolls every existing MTP line forward into the new 15-year window starting
          from the Start Date&rsquo;s Financial Year, carrying over whatever years already overlap and auto-growing
          recurring lines one more year (5% p.a. for IT projects, 3% p.a. otherwise).
        </p>
      )}
      {status === 'Open' && (
        <p className="mt-3 text-xs text-slate-400">
          Branch Rep, DY Head, Head, SMGT, Finance Officer and Finance Manager can all edit {EXERCISE_LABEL[period.type]} lines.
        </p>
      )}
      {status === 'Closed for Submission' && (
        <p className="mt-3 text-xs text-slate-400">
          Branch Rep, DY Head, Head and SMGT can no longer edit {EXERCISE_LABEL[period.type]} lines. Finance Officer
          and Finance Manager still can.
        </p>
      )}
      {status === 'Closed and Locked' && (
        <p className="mt-3 text-xs text-slate-400">
          No one but Finance Admin can make changes here now — reopen it to restore Finance Officer/Finance Manager
          editing.
        </p>
      )}
    </Card>
  );
}

function FinanceAdminBudgetPeriodContent() {
  const [periods, setPeriods] = useState<BudgetPeriod[]>([]);

  function reload() {
    api.budgetPeriods.list().then(setPeriods);
  }
  useEffect(reload, []);

  const periodOf = (type: BudgetExerciseType) => periods.find((p) => p.type === type);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Budget Period</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only one budget exercise can be active at a time. Opening one sets its Start/End Date and, for Medium Term
          Projection, rolls existing MTP lines forward into the new window.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {BUDGET_EXERCISE_TYPES.map((type) => {
          const period = periodOf(type);
          return period ? <ExerciseCard key={type} period={period} onChanged={reload} /> : null;
        })}
      </div>
    </div>
  );
}

export function FinanceAdminBudgetPeriodPage() {
  return (
    <RequireGroup group="Finance Admin">
      <FinanceAdminBudgetPeriodContent />
    </RequireGroup>
  );
}
