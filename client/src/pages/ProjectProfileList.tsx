import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { NewProjectModal } from '../components/NewProjectModal';
import { Button, Card, StatusBadge } from '../components/ui';
import { usePersona } from '../PersonaContext';
import type { Project } from '../types';

export function ProjectProfileList() {
  const { currentPersona, personas } = usePersona();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNew, setShowNew] = useState(false);
  const navigate = useNavigate();

  function reload() {
    api.projects.list().then(setProjects);
  }
  useEffect(reload, []);

  const canCreate = currentPersona?.roleType === 'Branch Rep';
  const nameOf = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Project Profile</h1>
        {canCreate && <Button onClick={() => setShowNew(true)}>+ New</Button>}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sub Account</th>
              <th className="px-4 py-3">Opened By</th>
              <th className="px-4 py-3">Operating Cost Centre</th>
              <th className="px-4 py-3">Development Cost Centre</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer hover:bg-indigo-50/60"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <td className="px-4 py-3 font-medium text-indigo-700">{p.title || '(untitled)'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3">{p.subAccount || '—'}</td>
                <td className="px-4 py-3">{nameOf(p.openedByPersonaId)}</td>
                <td className="px-4 py-3">{p.operatingCostCentre || '—'}</td>
                <td className="px-4 py-3">{p.developmentCostCentre || '—'}</td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            reload();
            navigate(`/projects/${id}`);
          }}
        />
      )}
    </div>
  );
}
