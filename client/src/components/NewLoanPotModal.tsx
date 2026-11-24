import { useState } from 'react';
import { api } from '../api';
import type { ExternalProjectFyStatus } from '../api';
import { Button, Field, currency, inputCls, selectCls } from './ui';
import { fyKey } from '../lib/calc';

// "Loan From" only offers projects currently showing Excess (they have
// room to lend); "Loan To" only offers projects showing Deficit (they need
// the money) — both lists come straight off Project FY Status (External),
// which is also what api.loanPots.create() re-checks server-side.
export function NewLoanPotModal({
  statuses,
  onClose,
  onCreated,
}: {
  statuses: ExternalProjectFyStatus[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const excessOptions = statuses.filter((s) => s.status === 'Excess');
  const deficitOptions = statuses.filter((s) => s.status === 'Deficit');
  const [loanFromProjectId, setLoanFromProjectId] = useState(excessOptions[0]?.project.id ?? '');
  const [loanToProjectId, setLoanToProjectId] = useState(deficitOptions[0]?.project.id ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fromStatus = excessOptions.find((s) => s.project.id === loanFromProjectId);
  const budgetPeriod = fromStatus ? fyKey(fromStatus.fy) : '—';

  async function submit() {
    setError(null);
    const loanAmount = Number(amount);
    if (!loanFromProjectId || !loanToProjectId) {
      setError('Loan From and Loan To are required.');
      return;
    }
    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      setError('Loan Amount must be greater than 0.');
      return;
    }
    setSaving(true);
    try {
      await api.loanPots.create({ loanFromProjectId, loanToProjectId, loanAmount });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h2 className="text-lg font-semibold text-slate-800">New Project Loan</h2>
        <p className="mt-1 text-sm text-slate-500">
          Creating this immediately books the repayment: a Return Loan line on Loan To's next Original Budget, and a
          Return from Loan line on Loan From's.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Loan From" hint="Projects currently showing Excess on Project FY Status (External)">
            <select className={selectCls} value={loanFromProjectId} onChange={(e) => setLoanFromProjectId(e.target.value)}>
              {excessOptions.length === 0 && <option value="">No projects with Excess</option>}
              {excessOptions.map((s) => (
                <option key={s.project.id} value={s.project.id}>
                  {s.project.title} (Excess {currency(s.difference)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Loan To" hint="Projects currently showing Deficit on Project FY Status (External)">
            <select className={selectCls} value={loanToProjectId} onChange={(e) => setLoanToProjectId(e.target.value)}>
              {deficitOptions.length === 0 && <option value="">No projects with Deficit</option>}
              {deficitOptions.map((s) => (
                <option key={s.project.id} value={s.project.id}>
                  {s.project.title} (Deficit {currency(s.difference)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Loan Amount">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Budget Period">
            <input className={inputCls} value={budgetPeriod} disabled readOnly />
          </Field>
          <Field label="Status">
            <input className={inputCls} value="Open" disabled readOnly />
          </Field>
          {error && <div className="text-sm text-rose-600">{error}</div>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || excessOptions.length === 0 || deficitOptions.length === 0}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
