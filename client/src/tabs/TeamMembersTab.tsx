import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, selectCls } from '../components/ui';
import { usePersona } from '../PersonaContext';
import type { Project, TeamMember } from '../types';

export function TeamMembersTab({ project }: { project: Project }) {
  const { currentPersona, personas } = usePersona();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.teamMembers.list(project.id).then(setMembers);
  }
  useEffect(reload, [project.id]);

  const isOwningBranchRep = currentPersona?.roleType === 'Branch Rep' && currentPersona.dept === project.openedByDept;
  const nameOf = (id: string) => personas.find((p) => p.id === id)?.name ?? id;
  const available = personas.filter((p) => !members.some((m) => m.personaId === p.id));

  async function add() {
    if (!selected) return;
    setError(null);
    try {
      await api.teamMembers.create(project.id, selected);
      setSelected('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    await api.teamMembers.remove(id);
    reload();
  }

  return (
    <div className="max-w-xl">
      {isOwningBranchRep && (
        <div className="mb-4 flex items-center gap-2">
          <select className={selectCls} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a persona&hellip;</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button onClick={add} disabled={!selected}>
            + Add
          </Button>
        </div>
      )}
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">{nameOf(m.personaId)}</td>
                <td className="px-4 py-3 text-right">
                  {isOwningBranchRep && (
                    <Button variant="ghost" onClick={() => remove(m.id)}>
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
