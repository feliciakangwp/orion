import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, inputCls } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import type { AccountCode } from '../types';

function AddAccountForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
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
      await api.accountCodes.create({ code: code.trim(), description: description.trim() });
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account Code</span>
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

function FinanceAdminAccountContent() {
  const [accounts, setAccounts] = useState<AccountCode[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  function reload() {
    api.accountCodes.list().then(setAccounts);
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
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Account Code</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{a.code}</td>
                <td className="px-4 py-3">{a.description}</td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
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
