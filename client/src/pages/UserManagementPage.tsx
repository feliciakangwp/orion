import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { Button, Card, inputCls, selectCls, StatusBadge } from '../components/ui';
import { RequireGroup } from '../components/RequireGroup';
import { GROUPS } from '../types';
import type { Group, User, UserStatus } from '../types';

function GroupCheckboxes({ selected, onChange }: { selected: Group[]; onChange: (groups: Group[]) => void }) {
  function toggle(group: Group) {
    onChange(selected.includes(group) ? selected.filter((g) => g !== group) : [...selected, group]);
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
      {GROUPS.map((group) => (
        <label key={group} className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={selected.includes(group)} onChange={() => toggle(group)} />
          {group}
        </label>
      ))}
    </div>
  );
}

function AddUserForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [status, setStatus] = useState<UserStatus>('Active');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (groups.length === 0) {
      setError('Select at least one group.');
      return;
    }
    setSaving(true);
    try {
      await api.users.create({ name: name.trim(), email: email.trim(), groups, status });
      setName('');
      setEmail('');
      setGroups([]);
      setStatus('Active');
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_2fr_1fr]">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as UserStatus)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Group (select one or more)
          </span>
          <GroupCheckboxes selected={groups} onChange={setGroups} />
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
        <div>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Adding…' : '+ Add'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function UserRow({ user, onChanged }: { user: User; onChanged: () => void }) {
  const [editingGroups, setEditingGroups] = useState(false);
  const [groups, setGroups] = useState<Group[]>(user.groups);
  const [error, setError] = useState<string | null>(null);

  async function saveGroups() {
    setError(null);
    if (groups.length === 0) {
      setError('Select at least one group.');
      return;
    }
    try {
      await api.users.update(user.id, { groups });
      setEditingGroups(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleStatus() {
    const next: UserStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    await api.users.update(user.id, { status: next });
    onChanged();
  }

  return (
    <tr className="align-top">
      <td className="px-4 py-3 font-medium text-slate-800">{user.name}</td>
      <td className="px-4 py-3 text-slate-600">{user.email}</td>
      <td className="px-4 py-3">
        {editingGroups ? (
          <div className="flex flex-col gap-2">
            <GroupCheckboxes selected={groups} onChange={setGroups} />
            {error && <span className="text-xs text-rose-600">{error}</span>}
            <div className="flex gap-2">
              <Button className="!px-2 !py-1 text-xs" onClick={saveGroups}>
                Save
              </Button>
              <Button
                className="!px-2 !py-1 text-xs"
                variant="secondary"
                onClick={() => {
                  setGroups(user.groups);
                  setEditingGroups(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {user.groups.map((g) => (
              <span key={g} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {g}
              </span>
            ))}
            <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => setEditingGroups(true)}>
              Edit
            </Button>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={user.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" onClick={toggleStatus}>
          Mark {user.status === 'Active' ? 'Inactive' : 'Active'}
        </Button>
      </td>
    </tr>
  );
}

function UserManagementContent() {
  const { users, reloadUsers } = useAuth();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">User Management</h1>
        <Button onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ Add'}</Button>
      </div>

      {showAdd && (
        <AddUserForm
          onAdded={() => {
            reloadUsers();
            setShowAdd(false);
          }}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <UserRow key={u.id} user={u} onChanged={reloadUsers} />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function UserManagementPage() {
  return (
    <RequireGroup group="Super Admin">
      <UserManagementContent />
    </RequireGroup>
  );
}
