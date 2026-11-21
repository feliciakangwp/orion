import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, StatusBadge } from '../components/ui';
import { isFinance } from '../lib/workflow';
import type { Project } from '../types';

// Project Profiles currently Pending Finance approval. Finance (Officer or
// Manager, or Super Admin) sees every one awaiting their approval; everyone
// else only sees their own requests — which they can still open and edit
// while Pending.
export function ProjectProfileRequestPage() {
  const { currentUser, users } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();

  function reload() {
    api.projects.list().then(setProjects);
  }
  useEffect(reload, [currentUser?.id]);

  const financeActor = !!currentUser && isFinance(currentUser);
  const pending = projects
    .filter((p) => p.status === 'Pending')
    .filter((p) => financeActor || p.openedByUserId === currentUser?.id);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Project Profile Request</h1>
        <p className="mt-1 text-sm text-slate-500">
          {financeActor
            ? 'Project Profiles pending your approval.'
            : 'Your Project Profile requests pending Finance approval. You can still open and edit a request while it is Pending.'}
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Opened By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pending.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-indigo-50/60" onClick={() => navigate(`/projects/${p.id}`)}>
                <td className="px-4 py-3 font-medium text-indigo-700">{p.title || '(untitled)'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3">{nameOf(p.openedByUserId)}</td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  No Pending Project Profile requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
