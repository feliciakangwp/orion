import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, inputCls, selectCls } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import { COST_CENTRE_TYPES } from '../types';
import type { CostCentreCode, CostCentreType, ExpenditureNature } from '../types';

function AddCostCentreForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const { users } = useAuth();
  const financeOfficers = users.filter((u) => u.groups.includes('Finance Officer') || u.groups.includes('Finance Manager'));
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CostCentreType>(COST_CENTRE_TYPES[0]);
  const [natureOfExpenditure, setNatureOfExpenditure] = useState<ExpenditureNature>('Development');
  const [financeOfficerUserId, setFinanceOfficerUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError('Cost Centre code and name are required.');
      return;
    }
    setSaving(true);
    try {
      await api.costCentres.create({
        code: code.trim(),
        name: name.trim(),
        type,
        natureOfExpenditure,
        financeOfficerUserId: financeOfficerUserId || null,
      });
      setCode('');
      setName('');
      setFinanceOfficerUserId('');
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Code</span>
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 998019" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Minor Development Project" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</span>
          <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as CostCentreType)}>
            {COST_CENTRE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nature of Expenditure</span>
          <select className={selectCls} value={natureOfExpenditure} onChange={(e) => setNatureOfExpenditure(e.target.value as ExpenditureNature)}>
            <option value="Development">Development</option>
            <option value="Operating">Operating</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Finance Officer</span>
          <select className={selectCls} value={financeOfficerUserId} onChange={(e) => setFinanceOfficerUserId(e.target.value)}>
            <option value="">Select&hellip;</option>
            {financeOfficers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function CostCentreRow({ costCentre, onChanged }: { costCentre: CostCentreCode; onChanged: () => void }) {
  const { users } = useAuth();
  const financeOfficers = users.filter((u) => u.groups.includes('Finance Officer') || u.groups.includes('Finance Manager'));
  const [error, setError] = useState<string | null>(null);

  async function update(data: Partial<Pick<CostCentreCode, 'type' | 'natureOfExpenditure' | 'financeOfficerUserId'>>) {
    setError(null);
    try {
      await api.costCentres.update(costCentre.id, data);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-800">
        {costCentre.code} {costCentre.name}
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
      </td>
      <td className="px-4 py-3 text-slate-600">{costCentre.code}</td>
      <td className="px-4 py-3 text-slate-600">{costCentre.name}</td>
      <td className="px-4 py-3">
        <select className={`${selectCls} w-44`} value={costCentre.type} onChange={(e) => update({ type: e.target.value as CostCentreType })}>
          {COST_CENTRE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          className={`${selectCls} w-32`}
          value={costCentre.natureOfExpenditure}
          onChange={(e) => update({ natureOfExpenditure: e.target.value as ExpenditureNature })}
        >
          <option value="Development">Development</option>
          <option value="Operating">Operating</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          className={`${selectCls} w-36`}
          value={costCentre.financeOfficerUserId ?? ''}
          onChange={(e) => update({ financeOfficerUserId: e.target.value || null })}
        >
          <option value="">—</option>
          {financeOfficers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

function FinanceAdminCostCentreContent() {
  const [costCentres, setCostCentres] = useState<CostCentreCode[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  function reload() {
    api.costCentres.list().then((list) => setCostCentres([...list].sort((a, b) => a.code.localeCompare(b.code))));
  }
  useEffect(reload, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Cost Centre</h1>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ Add'}</Button>
      </div>

      {showAdd && (
        <AddCostCentreForm
          onAdded={() => {
            reload();
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Display Name</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Nature of Expenditure</th>
              <th className="px-4 py-3">Finance Officer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {costCentres.map((c) => (
              <CostCentreRow key={c.id} costCentre={c} onChanged={reload} />
            ))}
            {costCentres.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No Cost Centres yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function FinanceAdminCostCentrePage() {
  return (
    <RequireGroup group="Finance Admin">
      <FinanceAdminCostCentreContent />
    </RequireGroup>
  );
}
