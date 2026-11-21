import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, inputCls, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import type { CatalogStatus, SubAccountCode } from '../types';

function AddSubAccountForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError('Sub Account code and name are required.');
      return;
    }
    setSaving(true);
    try {
      await api.subAccounts.create({ code: code.trim(), name: name.trim() });
      setCode('');
      setName('');
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sub Account Code</span>
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. Q1095" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sub Account Name</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ORION" />
        </label>
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
    </Card>
  );
}

function FinanceAdminSubAccountContent() {
  const [subAccounts, setSubAccounts] = useState<SubAccountCode[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.subAccounts.list().then((list) => setSubAccounts([...list].sort((a, b) => a.code.localeCompare(b.code))));
  }
  useEffect(reload, []);

  async function toggleStatus(subAccount: SubAccountCode) {
    setError(null);
    const next: CatalogStatus = subAccount.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await api.subAccounts.setStatus(subAccount.id, next);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Sub Account</h1>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ Add'}</Button>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Each Project Profile is assigned a unique Sub Account, which then auto-populates a new budget line's own Sub
        Account when it's created from one of that project's tabs.
      </p>

      {showAdd && (
        <AddSubAccountForm
          onAdded={() => {
            reload();
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Sub Account Code</th>
              <th className="px-4 py-3">Sub Account Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subAccounts.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{s.code}</td>
                <td className="px-4 py-3 text-slate-600">{s.name}</td>
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
            {subAccounts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No Sub Accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function FinanceAdminSubAccountPage() {
  return (
    <RequireGroup group="Finance Admin">
      <FinanceAdminSubAccountContent />
    </RequireGroup>
  );
}
