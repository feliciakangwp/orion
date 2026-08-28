import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Button, Card, currency, StatusBadge } from '../components/ui';
import { periodKeys, periodSpan } from '../lib/calc';
import { canApprove, canSubmit, isEditableByBranchRep, personaCanAct } from '../lib/workflow';
import { usePersona } from '../PersonaContext';
import type { BudgetKind, BudgetLine, FundingEntry, Project } from '../types';

const KIND_LABEL: Record<BudgetKind, string> = {
  MTE: 'MTE',
  BLOCK: 'Block',
  RB: 'Recurring Budget (RB)',
  OB: 'Operating Budget (OB)',
};

function BudgetLineRow({
  line,
  project,
  fundingEntries,
  keys,
  onLocalEdit,
  onServerUpdate,
  onRemoved,
}: {
  line: BudgetLine;
  project: Project;
  fundingEntries: FundingEntry[];
  keys: string[];
  onLocalEdit: (line: BudgetLine) => void;
  onServerUpdate: (line: BudgetLine) => void;
  onRemoved: (id: string) => void;
}) {
  const { currentPersona, personas, simulationYear } = usePersona();
  const [error, setError] = useState<string | null>(null);
  const isOwningBranchRep = currentPersona?.roleType === 'Branch Rep' && currentPersona.dept === project.openedByDept;
  const editable = isOwningBranchRep && isEditableByBranchRep(line.step);
  const canAct = currentPersona ? personaCanAct(line, currentPersona, project.openedByDept) : false;
  const showItFields = line.itProject === 'Yes';

  const reviewerOptions = personas.filter(
    (p) => p.dept === project.openedByDept && (p.roleType === 'DY Head' || p.roleType === 'Head')
  );
  const approverOptions = personas.filter((p) => p.dept === project.openedByDept && p.roleType === 'SMGT');
  const finOfficerOptions = personas.filter((p) => p.roleType === 'Fin Officer');
  const nameOf = (id: string | null) => (id ? personas.find((p) => p.id === id)?.name ?? id : '—');

  async function patch(data: Partial<BudgetLine>) {
    setError(null);
    try {
      const updated = await api.budgetLines.update(line.id, data, simulationYear);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setPeriod(key: string, value: number) {
    await patch({ periods: { ...line.periods, [key]: value } });
  }

  async function submit() {
    setError(null);
    try {
      const updated = await api.budgetLines.submit(line.id);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function approve() {
    setError(null);
    try {
      const updated = await api.budgetLines.approve(line.id);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sendBack() {
    setError(null);
    try {
      const updated = await api.budgetLines.return(line.id);
      onServerUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!confirm('Delete this line?')) return;
    await api.budgetLines.remove(line.id);
    onRemoved(line.id);
  }

  const cellInput = 'w-28 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400';

  return (
    <tr className="align-top">
      <td className="sticky left-0 z-10 bg-white px-3 py-2">
        <StatusBadge status={line.status} />
        {error && <div className="mt-1 max-w-[10rem] text-[10px] text-rose-600">{error}</div>}
      </td>
      <td className="px-2 py-2">
        <textarea
          className={`${cellInput} min-h-[2.5rem] w-40`}
          value={line.description}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, description: e.target.value })}
          onBlur={(e) => patch({ description: e.target.value })}
        />
      </td>
      <td className="px-2 py-2 text-xs text-slate-600">{project.title || '—'}</td>
      <td className="px-2 py-2">
        <select className={cellInput} value={line.opsOrDev} disabled={!editable} onChange={(e) => patch({ opsOrDev: e.target.value as any })}>
          <option value="">—</option>
          <option value="Ops">Ops</option>
          <option value="Dev">Dev</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <input
          className={cellInput}
          value={line.account}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, account: e.target.value })}
          onBlur={(e) => patch({ account: e.target.value })}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className={cellInput}
          value={line.subAcct}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, subAcct: e.target.value })}
          onBlur={(e) => patch({ subAcct: e.target.value })}
        />
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-36`}
          value={line.fundingEntryId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ fundingEntryId: e.target.value || null })}
        >
          <option value="">—</option>
          {fundingEntries.map((f) => (
            <option key={f.id} value={f.id}>
              {f.sourceOfFunding}
            </option>
          ))}
        </select>
      </td>
      {line.budgetType !== null && (
        <td className="px-2 py-2">
          <select className={cellInput} value={line.budgetType} disabled>
            <option value="RB">RB</option>
            <option value="OB">OB</option>
          </select>
        </td>
      )}
      <td className="px-2 py-2">
        <select className={cellInput} value={line.recurring} disabled={!editable} onChange={(e) => patch({ recurring: e.target.value as any })}>
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <input
          className={cellInput}
          value={line.costCentre}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, costCentre: e.target.value })}
          onBlur={(e) => patch({ costCentre: e.target.value })}
        />
      </td>
      <td className="px-2 py-2">
        <select className={cellInput} value={line.itProject} disabled={!editable} onChange={(e) => patch({ itProject: e.target.value as any })}>
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </td>
      <td className="px-2 py-2">
        {showItFields ? (
          <input
            className={cellInput}
            value={line.ictExp}
            disabled={!editable}
            onChange={(e) => onLocalEdit({ ...line, ictExp: e.target.value })}
            onBlur={(e) => patch({ ictExp: e.target.value })}
          />
        ) : (
          <span className="text-xs text-slate-300">n/a</span>
        )}
      </td>
      <td className="px-2 py-2">
        {showItFields ? (
          <select className={cellInput} value={line.buildOrBuy} disabled={!editable} onChange={(e) => patch({ buildOrBuy: e.target.value as any })}>
            <option value="">—</option>
            <option value="Build">Build</option>
            <option value="Buy">Buy</option>
          </select>
        ) : (
          <span className="text-xs text-slate-300">n/a</span>
        )}
      </td>
      <td className="px-2 py-2">
        <input
          className={cellInput}
          value={line.basis}
          disabled={!editable}
          onChange={(e) => onLocalEdit({ ...line, basis: e.target.value })}
          onBlur={(e) => patch({ basis: e.target.value })}
        />
      </td>
      <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{currency(line.total)}</td>
      {keys.map((key, i) => {
        const lockedByRecurring = line.recurring === 'Yes' && i > 0;
        return (
          <td key={key} className="px-1 py-2">
            <input
              type="number"
              className={`${cellInput} w-24 text-right`}
              value={line.periods[key] ?? 0}
              disabled={!editable || lockedByRecurring}
              onChange={(e) => onLocalEdit({ ...line, periods: { ...line.periods, [key]: Number(e.target.value) } })}
              onBlur={(e) => setPeriod(key, Number(e.target.value))}
            />
          </td>
        );
      })}
      <td className="px-2 py-2 text-xs text-slate-600">{nameOf(line.assignedToPersonaId)}</td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.reviewer1PersonaId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ reviewer1PersonaId: e.target.value || null })}
        >
          <option value="">—</option>
          {reviewerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.reviewer2PersonaId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ reviewer2PersonaId: e.target.value || null })}
        >
          <option value="">—</option>
          {reviewerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.approverPersonaId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ approverPersonaId: e.target.value || null })}
        >
          <option value="">—</option>
          {approverOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className={`${cellInput} w-32`}
          value={line.financeOfficerPersonaId ?? ''}
          disabled={!editable}
          onChange={(e) => patch({ financeOfficerPersonaId: e.target.value || null })}
        >
          <option value="">—</option>
          {finOfficerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="sticky right-0 z-10 whitespace-nowrap bg-white px-2 py-2">
        <div className="flex flex-col gap-1">
          {isOwningBranchRep && canSubmit(line.step) && (
            <Button className="!px-2 !py-1 text-xs" onClick={submit}>
              Submit
            </Button>
          )}
          {canAct && canApprove(line.step) && (
            <Button className="!px-2 !py-1 text-xs" variant="secondary" onClick={approve}>
              Approve
            </Button>
          )}
          {canAct && canApprove(line.step) && (
            <Button className="!px-2 !py-1 text-xs" variant="ghost" onClick={sendBack}>
              Return
            </Button>
          )}
          {isOwningBranchRep && line.step === 'BRANCH_REP_DRAFT' && (
            <Button className="!px-2 !py-1 text-xs" variant="danger" onClick={remove}>
              Delete
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function BudgetLinesTab({ project, kind }: { project: Project; kind: BudgetKind }) {
  const { currentPersona, simulationYear } = usePersona();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [fundingEntries, setFundingEntries] = useState<FundingEntry[]>([]);

  function reload() {
    api.budgetLines.list(project.id, kind).then(setLines);
    api.funding.list(project.id).then(setFundingEntries);
  }
  useEffect(reload, [project.id, kind]);

  const isOwningBranchRep = currentPersona?.roleType === 'Branch Rep' && currentPersona.dept === project.openedByDept;

  // MTE/Block period keys follow the global Simulation Year (top bar) rather
  // than a per-project setting, so every project is compared on the same FY
  // horizon. Existing lines keep whatever keys they were created with;
  // only the "no lines yet" fallback (and new lines) reflect the current year.
  const keys = useMemo(() => {
    if (lines.length > 0) return Object.keys(lines[0].periods);
    return periodKeys(kind, simulationYear);
  }, [lines, kind, simulationYear]);

  async function addNew() {
    await api.budgetLines.create(project.id, kind, simulationYear, 'new');
    reload();
  }
  async function addCarriedForward() {
    await api.budgetLines.create(project.id, kind, simulationYear, 'carried_forward');
    reload();
  }

  function updateLocal(updated: BudgetLine) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">
          {KIND_LABEL[kind]} &middot; {periodSpan(kind)} {kind === 'RB' || kind === 'OB' ? 'months' : 'years'} from{' '}
          {kind === 'RB' || kind === 'OB' ? 'Apr' : keys[0]}
        </h2>
        {isOwningBranchRep && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={addCarriedForward}>
              + Pull Forward (Draft)
            </Button>
            <Button onClick={addNew}>+ New</Button>
          </div>
        )}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1800px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Status</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Project Title</th>
              <th className="px-2 py-2">Ops/Dev</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Sub Acct</th>
              <th className="px-2 py-2">Source of Funding</th>
              {kind === 'RB' || kind === 'OB' ? <th className="px-2 py-2">Budget Type</th> : null}
              <th className="px-2 py-2">Recurring</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2">IT Proj?</th>
              <th className="px-2 py-2">ICT Exp</th>
              <th className="px-2 py-2">Build/Buy</th>
              <th className="px-2 py-2">Basis</th>
              <th className="px-2 py-2 text-right">Total</th>
              {keys.map((k) => (
                <th key={k} className="px-1 py-2 text-right">
                  {k}
                </th>
              ))}
              <th className="px-2 py-2">Assigned to</th>
              <th className="px-2 py-2">Reviewer 1</th>
              <th className="px-2 py-2">Reviewer 2</th>
              <th className="px-2 py-2">Approver</th>
              <th className="px-2 py-2">Finance Officer</th>
              <th className="sticky right-0 z-10 bg-slate-50 px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <BudgetLineRow
                key={line.id}
                line={line}
                project={project}
                fundingEntries={fundingEntries}
                keys={keys}
                onLocalEdit={updateLocal}
                onServerUpdate={updateLocal}
                onRemoved={(id) => setLines((prev) => prev.filter((l) => l.id !== id))}
              />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={22} className="px-4 py-8 text-center text-slate-400">
                  No {KIND_LABEL[kind]} lines yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-slate-400">
        Recurring lines auto-calculate later periods from the first period&rsquo;s amount (5% p.a. for IT projects,
        3% p.a. otherwise). Non-recurring lines are keyed independently per period.
      </p>
    </div>
  );
}
