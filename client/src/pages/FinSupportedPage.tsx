import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency } from '../components/ui';
import { canEditFinSupported } from '../lib/workflow';
import type { FinSupportedLineWithMainstreaming, Project } from '../types';

function FinSupportedRow({
  line,
  project,
  keys,
  editable,
  onUpdated,
}: {
  line: FinSupportedLineWithMainstreaming;
  project: Project | null;
  keys: string[];
  editable: boolean;
  onUpdated: (line: FinSupportedLineWithMainstreaming) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function setPeriod(key: string, value: number) {
    setError(null);
    try {
      const updated = await api.finSupportedLines.update(line.id, { [key]: value });
      onUpdated({ ...updated, mainstreamingPeriods: line.mainstreamingPeriods });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cellInput = 'w-24 rounded border border-slate-300 px-1.5 py-1 text-xs text-right disabled:bg-slate-50 disabled:text-slate-400';
  const total = Object.values(line.periods).reduce((s, v) => s + (Number(v) || 0), 0);
  const mainstreamingTotal = line.mainstreamingPeriods
    ? Object.values(line.mainstreamingPeriods).reduce((s, v) => s + (Number(v) || 0), 0)
    : 0;

  return (
    <tr className="align-top">
      <td className="px-2 py-2 text-xs text-slate-700">
        {line.description || '—'}
        {error && <div className="mt-1 text-[10px] text-rose-600">{error}</div>}
      </td>
      <td className="px-2 py-2 text-xs text-slate-600">{project?.title || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.account || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.costCentre || '—'}</td>
      <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{currency(total)}</td>
      <td className="px-2 py-2 text-right text-xs font-semibold text-amber-700">
        {mainstreamingTotal > 0 ? currency(mainstreamingTotal) : '—'}
      </td>
      {keys.map((key) => {
        const mainstreamingAmount = line.mainstreamingPeriods?.[key] ?? 0;
        return (
          <td key={key} className="px-1 py-2">
            <input
              type="number"
              className={cellInput}
              defaultValue={line.periods[key] ?? 0}
              disabled={!editable}
              onBlur={(e) => setPeriod(key, Number(e.target.value))}
            />
            {mainstreamingAmount > 0 && (
              <div className="mt-0.5 text-right text-[10px] text-amber-700">{currency(mainstreamingAmount)} mainstreaming</div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// Snapshots created the moment an MTP line reaches Approved, rounded to
// the nearest 100 (amounts under 100 left exactly as they are). Editing
// here (Finance Officer/Finance Manager only) never touches the original
// line in Budget Line Item. Once the project's MTP budget period is
// Closed for Submission (or later), any spend beyond its external funding
// pot is shown split out as Mainstreaming.
export function FinSupportedPage() {
  const { currentUser } = useAuth();
  const [lines, setLines] = useState<FinSupportedLineWithMainstreaming[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  function reload() {
    api.finSupportedLines.list().then(setLines);
    api.projects.list().then(setProjects);
  }
  useEffect(reload, []);

  const editable = !!currentUser && canEditFinSupported(currentUser);
  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);
  const keys = useMemo(() => (lines[0] ? Object.keys(lines[0].periods) : []), [lines]);
  const anyMainstreaming = lines.some((l) => l.mainstreamingPeriods && Object.values(l.mainstreamingPeriods).some((v) => v > 0));

  function updateLocal(updated: FinSupportedLineWithMainstreaming) {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Fin Supported</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every MTP line that has reached Approved, duplicated here with figures rounded to the nearest 100 (amounts
          under 100 are left as they are). {editable ? 'You can edit the figures here.' : 'View only.'} Editing this
          copy never changes the original line in Budget Line Item.
          {anyMainstreaming && (
            <>
              {' '}
              Amber figures are <strong>Mainstreaming</strong> — spend beyond an externally-funded project's
              Supported Fund (or past its Fund Expiry Date), computed once its MTP budget period is Closed for
              Submission.
            </>
          )}
        </p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1300px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Project Title</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Mainstreaming Total</th>
              {keys.map((k) => (
                <th key={k} className="px-1 py-2 text-right">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <FinSupportedRow key={line.id} line={line} project={projectOf(line.projectId)} keys={keys} editable={editable} onUpdated={updateLocal} />
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No MTP lines have reached Approved yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
