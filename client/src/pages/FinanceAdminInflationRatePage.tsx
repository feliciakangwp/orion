import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, inputCls } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import type { InflationRate } from '../types';

function RateRow({ rate, onChanged }: { rate: InflationRate; onChanged: () => void }) {
  const [value, setValue] = useState(String(rate.value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(String(rate.value)), [rate.value]);
  const dirty = value !== String(rate.value);

  async function save() {
    setError(null);
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      setError('Enter a non-negative percentage.');
      return;
    }
    setSaving(true);
    try {
      await api.inflationRates.update(rate.id, num);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-800">{rate.item}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            className={`${inputCls} w-24`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="text-sm text-slate-500">%</span>
          {dirty && (
            <Button className="!px-2 !py-1 text-xs" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
      </td>
    </tr>
  );
}

function FinanceAdminInflationRateContent() {
  const [rates, setRates] = useState<InflationRate[]>([]);

  function reload() {
    api.inflationRates.list().then(setRates);
  }
  useEffect(reload, []);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Inflation Rate</h1>
        <p className="mt-1 text-sm text-slate-500">
          Drives both the auto-growth of recurring MTP/Block lines and the MTP Variance justification threshold.
          Finance Admin can change the values only.
        </p>
      </div>

      <Card className="max-w-md overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rates.map((r) => (
              <RateRow key={r.id} rate={r} onChanged={reload} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function FinanceAdminInflationRatePage() {
  return (
    <RequireGroup group="Finance Admin">
      <FinanceAdminInflationRateContent />
    </RequireGroup>
  );
}
