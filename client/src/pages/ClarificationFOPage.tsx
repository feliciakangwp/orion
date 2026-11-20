import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import type { BudgetLine, Project } from '../types';

// Finance Manager's visibility into the clarification pipeline that isn't
// her turn yet — MTP lines still with Finance Officer (either their first
// pass, or re-clarifying after she rejected it). Read-only: it's not her
// line to act on until it's routed to her (see Clarification (FM)).
function ClarificationFOContent() {
  const { currentUser, users } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  function reload() {
    api.budgetLines.listAllMtp().then(setLines);
    api.projects.list().then(setProjects);
  }
  useEffect(reload, [currentUser?.id]);

  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);
  const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? id : '—');
  const rows = lines.filter((l) => l.step === 'CLARIFICATION_FO' || l.step === 'CLARIFICATION_FO_REWORK');

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Clarification (FO)</h1>
        <p className="mt-1 text-sm text-slate-500">
          MTP lines still with Finance Officer in the clarification stage — not yet your turn.
        </p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Assigned to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3">
                  <StatusBadge status={line.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{line.description || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{projectOf(line.projectId)?.title || '—'}</td>
                <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">{currency(line.total)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{nameOf(line.assignedToUserId)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No MTP lines are currently with Finance Officer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function ClarificationFOPage() {
  return (
    <RequireGroup group="Finance Manager">
      <ClarificationFOContent />
    </RequireGroup>
  );
}
