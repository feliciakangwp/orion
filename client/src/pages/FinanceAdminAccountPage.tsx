import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, inputCls, selectCls, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import type { AccountCode, AccountLevel } from '../types';

const LEVELS: AccountLevel[] = [1, 2, 3, 4, 5];

function AddAccountForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<AccountLevel>(5);
  const [opsOrDev, setOpsOrDev] = useState<AccountCode['opsOrDev']>('Development');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!code.trim() || !description.trim()) {
      setError('Account code and description are required.');
      return;
    }
    setSaving(true);
    try {
      await api.accountCodes.create({ code: code.trim(), description: description.trim(), level, opsOrDev });
      setCode('');
      setDescription('');
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto_auto_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Code</span>
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 511604" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. ICT Consultation Services"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Level</span>
          <select className={selectCls} value={level} onChange={(e) => setLevel(Number(e.target.value) as AccountLevel)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operating/Development</span>
          <select className={selectCls} value={opsOrDev} onChange={(e) => setOpsOrDev(e.target.value as AccountCode['opsOrDev'])}>
            <option value="Development">Development</option>
            <option value="Operating">Operating</option>
          </select>
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

function AccountRow({ account, onChanged }: { account: AccountCode; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function setOpsOrDev(opsOrDev: AccountCode['opsOrDev']) {
    setError(null);
    try {
      await api.accountCodes.update(account.id, { opsOrDev });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleStatus() {
    setError(null);
    try {
      await api.accountCodes.update(account.id, { status: account.status === 'Active' ? 'Inactive' : 'Active' });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-800">
        {account.code} {account.description}
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
      </td>
      <td className="px-4 py-3">
        <select
          className={`${selectCls} w-40`}
          value={account.opsOrDev}
          onChange={(e) => setOpsOrDev(e.target.value as AccountCode['opsOrDev'])}
        >
          <option value="Development">Development</option>
          <option value="Operating">Operating</option>
        </select>
      </td>
      <td className="px-4 py-3 text-slate-600">Level {account.level}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={account.status} />
          <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={toggleStatus}>
            Mark {account.status === 'Active' ? 'Inactive' : 'Active'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function FinanceAdminAccountContent() {
  const [accounts, setAccounts] = useState<AccountCode[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  function reload() {
    api.accountCodes.list().then((list) => setAccounts([...list].sort((a, b) => a.code.localeCompare(b.code))));
  }
  useEffect(reload, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Account</h1>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ Add'}</Button>
      </div>

      {showAdd && (
        <AddAccountForm
          onAdded={() => {
            reload();
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Operating/Development</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} onChanged={reload} />
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No Accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function FinanceAdminAccountPage() {
  return (
    <RequireGroup group="Finance Admin">
      <FinanceAdminAccountContent />
    </RequireGroup>
  );
}
