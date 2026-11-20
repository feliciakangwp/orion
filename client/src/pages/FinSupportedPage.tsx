import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency } from '../components/ui';
import { canEditFinSupported } from '../lib/workflow';
import type { FinSupportedLine, Project } from '../types';

function FinSupportedRow({
  line,
  project,
  keys,
  editable,
  onUpdated,
}: {
  line: FinSupportedLine;
  project: Project | null;
  keys: string[];
  editable: boolean;
  onUpdated: (line: FinSupportedLine) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function setPeriod(key: string, value: number) {
    setError(null);
    try {
      const updated = await api.finSupportedLines.update(line.id, { [key]: value });
      onUpdated(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cellInput = 'w-24 rounded border border-slate-300 px-1.5 py-1 text-xs text-right disabled:bg-slate-50 disabled:text-slate-400';

  return (
    <tr className="align-top">
      <td className="px-2 py-2 text-xs text-slate-700">
        {line.description || '—'}
        {error && <div className="mt-1 text-[10px] text-rose-600">{error}</div>}
      </td>
      <td className="px-2 py-2 text-xs text-slate-600">{project?.title || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.account || '—'}</td>
      <td className="px-2 py-2 text-xs text-slate-600">{line.costCentre || '—'}</td>
      <td className="px-2 py-2 text-right text-xs font-semibold text-slate-700">{currency(Object.values(line.periods).reduce((s, v) => s + (Number(v) || 0), 0))}</td>
      {keys.map((key) => (
        <td key={key} className="px-1 py-2">
          <input
            type="number"
            className={cellInput}
            defaultValue={line.periods[key] ?? 0}
            disabled={!editable}
            onBlur={(e) => setPeriod(key, Number(e.target.value))}
          />
        </td>
      ))}
    </tr>
  );
}

// Snapshots created the moment an MTP line reaches Approved, rounded to
// the nearest 100 (amounts under 100 left exactly as they are). Editing
// here (Finance Officer/Finance Manager only) never touches the original
// line in Budget Line Item.
export function FinSupportedPage() {
  const { currentUser } = useAuth();
  const [lines, setLines] = useState<FinSupportedLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  function reload() {
    api.finSupportedLines.list().then(setLines);
    api.projects.list().then(setProjects);
  }
  useEffect(reload, []);

  const editable = !!currentUser && canEditFinSupported(currentUser);
  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);
  const keys = useMemo(() => (lines[0] ? Object.keys(lines[0].periods) : []), [lines]);

  function updateLocal(updated: FinSupportedLine) {
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
        </p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Project Title</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Cost Centre</th>
              <th className="px-2 py-2 text-right">Total</th>
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
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
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
