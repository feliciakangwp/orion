import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, inputCls, selectCls, StatusBadge } from '../components/ui';
import { isFinanceOrFinanceAdmin, isOwningBranchRep as isOwningBranchRepUser } from '../lib/workflow';
import type { CostCentreCode, FundingEntry, FundingSource, Project } from '../types';

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

// Pot details (Pot ID, Supported Fund amount, Start/Expiry Date,
// Development/Operating Cost Centre) only apply to an External entry —
// they drive the Mainstreaming computation shown in Fin Supported once the
// MTP budget period is Closed for Submission. Finance fills these in, not
// the Branch Rep.
function PotDetailsPanel({
  entry,
  editable,
  costCentres,
  onChanged,
}: {
  entry: FundingEntry;
  editable: boolean;
  costCentres: CostCentreCode[];
  onChanged: () => void;
}) {
  const [fundingPotId, setFundingPotId] = useState(entry.fundingPotId);
  const [supportedFund, setSupportedFund] = useState(String(entry.supportedFund));
  const [fundStartDate, setFundStartDate] = useState(entry.fundStartDate ?? '');
  const [fundExpiryDate, setFundExpiryDate] = useState(entry.fundExpiryDate ?? '');
  const [developmentCostCentre, setDevelopmentCostCentre] = useState(entry.developmentCostCentre);
  const [operatingCostCentre, setOperatingCostCentre] = useState(entry.operatingCostCentre);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const devCostCentres = costCentres.filter((c) => c.natureOfExpenditure === 'Development');
  const opsCostCentres = costCentres.filter((c) => c.natureOfExpenditure === 'Operating');

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.funding.updatePotDetails(entry.id, {
        fundingPotId,
        supportedFund: Number(supportedFund) || 0,
        fundStartDate: fundStartDate || null,
        fundExpiryDate: fundExpiryDate || null,
        developmentCostCentre,
        operatingCostCentre,
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={4} className="bg-slate-50 px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Funding Pot ID</span>
            <input className={inputCls} value={fundingPotId} disabled={!editable} onChange={(e) => setFundingPotId(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supported Fund</span>
            <input
              type="number"
              className={inputCls}
              value={supportedFund}
              disabled={!editable}
              onChange={(e) => setSupportedFund(e.target.value)}
            />
          </label>
          <div />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fund Start Date</span>
            <input
              type="date"
              className={inputCls}
              value={fundStartDate}
              disabled={!editable}
              onChange={(e) => setFundStartDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fund Expiry Date</span>
            <input
              type="date"
              className={inputCls}
              value={fundExpiryDate}
              disabled={!editable}
              onChange={(e) => setFundExpiryDate(e.target.value)}
            />
          </label>
          <div />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project Development Cost Centre</span>
            <select className={selectCls} value={developmentCostCentre} disabled={!editable} onChange={(e) => setDevelopmentCostCentre(e.target.value)}>
              <option value="">—</option>
              {devCostCentres.map((c) => (
                <option key={c.id} value={`${c.code} ${c.name}`}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project Operating Cost Centre</span>
            <select className={selectCls} value={operatingCostCentre} disabled={!editable} onChange={(e) => setOperatingCostCentre(e.target.value)}>
              <option value="">—</option>
              {opsCostCentres.map((c) => (
                <option key={c.id} value={`${c.code} ${c.name}`}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
        {editable && (
          <div className="mt-3">
            <Button className="!px-2 !py-1 text-xs" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Fund Details'}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function SourceOfFundingTab({ project }: { project: Project }) {
  const { currentUser } = useAuth();
  const [entries, setEntries] = useState<FundingEntry[]>([]);
  const [catalog, setCatalog] = useState<FundingSource[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentreCode[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.funding.list(project.id).then(setEntries);
    api.fundingCatalog.list().then(setCatalog);
    api.costCentres.list().then(setCostCentres);
  }
  useEffect(reload, [project.id]);

  const isOwningBranchRep = !!currentUser && isOwningBranchRepUser(currentUser, project);
  const isFinanceActor = !!currentUser && isFinanceOrFinanceAdmin(currentUser);

  const sourceOf = (id: string) => catalog.find((c) => c.id === id);
  // Branch Reps may only pick Pipeline, Active catalog entries; Finance picks
  // the matching Approved entry as the approval action itself. Mainstreaming
  // is system-computed only — never offered on either picker.
  const pipelineOptions = catalog.filter((c) => c.status === 'Active' && c.maturity === 'Pipeline' && c.name !== 'Mainstreaming');
  const approvedOptions = catalog.filter((c) => c.status === 'Active' && c.maturity === 'Approved' && c.name !== 'Mainstreaming');

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

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
              const isExternal = source?.category === 'External';
              const editableByBranchRep = isOwningBranchRep && isPipeline;
              const isExpanded = expanded.has(entry.id);
              return (
                <Fragment key={entry.id}>
                  <tr>
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
                        {isExternal && (
                          <Button variant="ghost" onClick={() => toggleExpanded(entry.id)}>
                            {isExpanded ? 'Hide' : 'Show'} Fund Details
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExternal && isExpanded && (
                    <PotDetailsPanel entry={entry} editable={isFinanceActor} costCentres={costCentres} onChanged={reload} />
                  )}
                </Fragment>
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
