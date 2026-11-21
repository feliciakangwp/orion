import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, inputCls } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import type { Division } from '../types';

function AddDivisionForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    try {
      await api.divisions.create(name.trim());
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IT Directorate" />
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

function FinanceAdminDivisionContent() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  function reload() {
    api.divisions.list().then(setDivisions);
  }
  useEffect(reload, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Division</h1>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ Add'}</Button>
      </div>

      {showAdd && (
        <AddDivisionForm
          onAdded={() => {
            reload();
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {divisions.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{d.name}</td>
              </tr>
            ))}
            {divisions.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400">No Divisions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function FinanceAdminDivisionPage() {
  return (
    <RequireGroup group="Finance Admin">
      <FinanceAdminDivisionContent />
    </RequireGroup>
  );
}
