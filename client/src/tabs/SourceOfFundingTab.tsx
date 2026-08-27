import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, inputCls, selectCls, StatusBadge } from '../components/ui';
import { usePersona } from '../PersonaContext';
import { EXTERNAL_FUNDING_SOURCES, INTERNAL_FUNDING_SOURCES, type FundingEntry, type FundingSource, type Project } from '../types';

const ALL_SOURCES: FundingSource[] = [...EXTERNAL_FUNDING_SOURCES, ...INTERNAL_FUNDING_SOURCES];

function FundingPotCell({ entry, onDone }: { entry: FundingEntry; onDone: () => void }) {
  const [potId, setPotId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function approve() {
    if (!potId.trim()) {
      setError('Funding Pot ID is required to approve.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.funding.approve(entry.id, potId.trim());
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className={`${inputCls} w-32`}
        placeholder="Pot ID"
        value={potId}
        onChange={(e) => setPotId(e.target.value)}
      />
      <Button onClick={approve} disabled={saving}>
        Approve
      </Button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

export function SourceOfFundingTab({ project }: { project: Project }) {
  const { currentPersona } = usePersona();
  const [entries, setEntries] = useState<FundingEntry[]>([]);
  const [newSource, setNewSource] = useState<FundingSource>('ATB');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.funding.list(project.id).then(setEntries);
  }
  useEffect(reload, [project.id]);

  const isOwningBranchRep = currentPersona?.roleType === 'Branch Rep' && currentPersona.dept === project.openedByDept;
  const isFinance = currentPersona?.roleType === 'Fin Officer' || currentPersona?.roleType === 'Fin Manager';

  async function addEntry() {
    setError(null);
    try {
      await api.funding.create(project.id, newSource);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changeSource(entry: FundingEntry, source: FundingSource) {
    setError(null);
    try {
      await api.funding.update(entry.id, { sourceOfFunding: source });
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
        <div className="mb-4 flex items-center gap-2">
          <select className={`${selectCls} w-48`} value={newSource} onChange={(e) => setNewSource(e.target.value as FundingSource)}>
            {ALL_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button onClick={addEntry}>+ New Funding Source</Button>
        </div>
      )}
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Funding Pot ID</th>
              <th className="px-4 py-3">Source of Funding</th>
              <th className="px-4 py-3">Funding Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const isMainstreaming = entry.sourceOfFunding === 'Mainstreaming';
              const editableSource = isOwningBranchRep && entry.status === 'Pipeline';
              return (
                <tr key={entry.id}>
                  <td className="px-4 py-3">{entry.fundingPotId || '—'}</td>
                  <td className="px-4 py-3">
                    {editableSource ? (
                      <select
                        className={`${selectCls} w-36`}
                        value={entry.sourceOfFunding}
                        onChange={(e) => changeSource(entry, e.target.value as FundingSource)}
                      >
                        {ALL_SOURCES.filter((s) => s !== 'Mainstreaming' || isMainstreaming).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      entry.sourceOfFunding
                    )}
                  </td>
                  <td className="px-4 py-3">{entry.fundingType}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isFinance && entry.status === 'Pipeline' && !isMainstreaming && (
                        <FundingPotCell entry={entry} onDone={reload} />
                      )}
                      {isOwningBranchRep && entry.status === 'Pipeline' && (
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
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No funding sources yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
