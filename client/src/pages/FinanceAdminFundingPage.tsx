import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, inputCls, selectCls, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import type { CatalogStatus, FundingCategory, FundingMaturity, FundingSource } from '../types';

function AddFundingSourceForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [maturity, setMaturity] = useState<FundingMaturity>('Pipeline');
  const [category, setCategory] = useState<FundingCategory>('External');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Source of Fund is required.');
      return;
    }
    setSaving(true);
    try {
      await api.fundingCatalog.create({ name: name.trim(), maturity, category });
      setName('');
      setMaturity('Pipeline');
      setCategory('External');
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source of Fund</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Above the Block (P)" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</span>
          <select className={selectCls} value={maturity} onChange={(e) => setMaturity(e.target.value as FundingMaturity)}>
            <option value="Pipeline">Pipeline</option>
            <option value="Approved">Approved</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Internal/External</span>
          <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value as FundingCategory)}>
            <option value="External">External</option>
            <option value="Internal">Internal</option>
          </select>
        </label>
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Adding…' : '+ Add'}
        </Button>
      </div>
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
    </Card>
  );
}

function FinanceAdminFundingContent() {
  const [sources, setSources] = useState<FundingSource[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.fundingCatalog.list().then(setSources);
  }
  useEffect(reload, []);

  async function toggleStatus(source: FundingSource) {
    setError(null);
    const next: CatalogStatus = source.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await api.fundingCatalog.setStatus(source.id, next);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Source of Funding</h1>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ Add'}</Button>
      </div>

      {showAdd && (
        <AddFundingSourceForm
          onAdded={() => {
            reload();
            setShowAdd(false);
          }}
        />
      )}
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Source of Fund</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Internal/External</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sources.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.maturity} />
                </td>
                <td className="px-4 py-3">{s.category}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" onClick={() => toggleStatus(s)}>
                    Mark {s.status === 'Active' ? 'Inactive' : 'Active'}
                  </Button>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No Sources of Funding yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function FinanceAdminFundingPage() {
  return (
    <RequireGroup group="Finance Admin">
      <FinanceAdminFundingContent />
    </RequireGroup>
  );
}
