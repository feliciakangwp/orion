import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, inputCls } from '../components/ui';
import type { Project, TeamMember, User } from '../types';

function AddTeamMembersModal({
  project,
  excludeUserIds,
  onClose,
  onAdded,
}: {
  project: Project;
  excludeUserIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { users } = useAuth();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !excludeUserIds.has(u.id))
      .filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [users, query, excludeUserIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.teamMembers.addMany(project.id, Array.from(selected));
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-lg font-semibold text-slate-800">Add Team Members</h2>
          <input
            className={`${inputCls} mt-3`}
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {candidates.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
              <span className="flex-1 text-slate-800">{u.name}</span>
              <span className="text-xs text-slate-400">{u.groups.join(', ')}</span>
            </label>
          ))}
          {candidates.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-400">No matching users.</p>}
        </div>
        {error && <div className="px-4 text-sm text-rose-600">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={addSelected} disabled={saving || selected.size === 0}>
            {saving ? 'Adding…' : `Add Selected (${selected.size})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TeamMembersTab({ project }: { project: Project }) {
  const { currentUser, users } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  function reload() {
    api.teamMembers.list(project.id).then(setMembers);
  }
  useEffect(reload, [project.id]);

  const isOwningBranchRep =
    !!currentUser && currentUser.id === project.openedByUserId && currentUser.groups.includes('Branch Rep');
  const userOf = (id: string): User | undefined => users.find((u) => u.id === id);

  async function remove(id: string) {
    await api.teamMembers.remove(id);
    reload();
  }

  return (
    <div className="max-w-xl">
      {isOwningBranchRep && (
        <div className="mb-4">
          <Button onClick={() => setShowAdd(true)}>+ Add</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => {
              const user = userOf(m.userId);
              return (
                <tr key={m.id}>
                  <td className="px-4 py-3">{user?.name ?? m.userId}</td>
                  <td className="px-4 py-3 text-slate-500">{user?.groups.join(', ') ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {isOwningBranchRep && (
                      <Button variant="ghost" onClick={() => remove(m.id)}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showAdd && (
        <AddTeamMembersModal
          project={project}
          excludeUserIds={new Set(members.map((m) => m.userId))}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
