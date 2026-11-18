import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, selectCls, StatusBadge } from '../components/ui';
import { isFinanceOrFinanceAdmin, isOwningBranchRep as isOwningBranchRepUser } from '../lib/workflow';
import type { FundingEntry, FundingSource, Project } from '../types';

function AddSourceOfFundingModal({
  pipelineOptions,
  onClose,
  onAdded,
}: {
  pipelineOptions: FundingSource[];
  onClose: () => void;
  onAdded: (fundingSourceId: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!choice) {
      setError('Select a Source of Fund.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onAdded(choice);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <h2 className="text-lg font-semibold text-slate-800">Add Source of Fund</h2>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source of Fund</span>
          <select className={selectCls} value={choice} onChange={(e) => setChoice(e.target.value)} autoFocus>
            <option value="">Select&hellip;</option>
            {pipelineOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !choice}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PromoteCell({
  entry,
  approvedOptions,
  onDone,
}: {
  entry: FundingEntry;
  approvedOptions: FundingSource[];
  onDone: () => void;
}) {
  const [choice, setChoice] = useState(approvedOptions[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function promote() {
    if (!choice) {
      setError('Select an Approved Source of Funding.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.funding.update(entry.id, choice);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={`${selectCls} w-44`} value={choice} onChange={(e) => setChoice(e.target.value)}>
        {approvedOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Button onClick={promote} disabled={saving || !choice}>
        Update to Approved
      </Button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

export function SourceOfFundingTab({ project }: { project: Project }) {
  const { currentUser } = useAuth();
  const [entries, setEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.funding.list(project.id).then(setEntries);
    api.fundingCatalog.list().then(setCatalog);
  }
  useEffect(reload, [project.id]);

  const isOwningBranchRep = !!currentUser && isOwningBranchRepUser(currentUser, project);
  const isFinanceActor = !!currentUser && isFinanceOrFinanceAdmin(currentUser);

  const sourceOf = (id: string) => catalog.find((c) => c.id === id);
  // Branch Reps may only pick Pipeline, Active catalog entries; Finance picks
  // the matching Approved entry as the approval action itself.
  const pipelineOptions = catalog.filter((c) => c.status === 'Active' && c.maturity === 'Pipeline');
  const approvedOptions = catalog.filter((c) => c.status === 'Active' && c.maturity === 'Approved');

  async function addEntry(fundingSourceId: string) {
    setError(null);
    try {
      await api.funding.create(project.id, fundingSourceId);
      setShowAdd(false);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changeSource(entry: FundingEntry, fundingSourceId: string) {
    setError(null);
    try {
      await api.funding.update(entry.id, fundingSourceId);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(entry: FundingEntry) {
    setError(null);
    try {
      await api.funding.remove(entry.id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      {isOwningBranchRep && (
        <div className="mb-4">
          <Button onClick={() => setShowAdd(true)}>+ Add Source of Fund</Button>
        </div>
      )}
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Source of Funding</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const source = sourceOf(entry.fundingSourceId);
              const isPipeline = source?.maturity === 'Pipeline';
              const editableByBranchRep = isOwningBranchRep && isPipeline;
              return (
                <tr key={entry.id}>
                  <td className="px-4 py-3">
                    {editableByBranchRep ? (
                      <select
                        className={`${selectCls} w-56`}
                        value={entry.fundingSourceId}
                        onChange={(e) => changeSource(entry, e.target.value)}
                      >
                        {pipelineOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      source?.name ?? '—'
                    )}
                  </td>
                  <td className="px-4 py-3">{source?.category ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={source?.maturity ?? '—'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {isFinanceActor && isPipeline && (
                        <PromoteCell entry={entry} approvedOptions={approvedOptions} onDone={reload} />
                      )}
                      {isOwningBranchRep && isPipeline && (
                        <Button variant="ghost" onClick={() => remove(entry)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No funding sources yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showAdd && (
        <AddSourceOfFundingModal
          pipelineOptions={pipelineOptions}
          onClose={() => setShowAdd(false)}
          onAdded={addEntry}
        />
      )}
    </div>
  );
}
