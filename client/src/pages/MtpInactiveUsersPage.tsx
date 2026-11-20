import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, StatusBadge } from '../components/ui';
import type { BudgetLine, Project, User } from '../types';

const TAGGED_ROLES: Array<{ field: keyof BudgetLine; label: string }> = [
  { field: 'assignedToUserId', label: 'Assigned to' },
  { field: 'reviewer1UserId', label: 'Reviewer 1' },
  { field: 'reviewer2UserId', label: 'Reviewer 2' },
  { field: 'approverUserId', label: 'Approver' },
  { field: 'financeOfficerUserId', label: 'Finance Officer' },
];

// Cleanup view: every MTP line with at least one tagged user (assignee,
// Reviewer 1/2, Approver, or Finance Officer) now set Inactive in User
// Management — a line stuck on someone no longer active needs a new
// assignee before it can move forward.
export function MtpInactiveUsersPage() {
  const { currentUser, users } = useAuth();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  function reload() {
    api.budgetLines.listAllMtp().then(setLines);
    api.projects.list().then(setProjects);
  }
  useEffect(reload, [currentUser?.id]);

  const userOf = (id: string | null): User | undefined => (id ? users.find((u) => u.id === id) : undefined);
  const projectOf = (id: string | null) => (id ? projects.find((p) => p.id === id) ?? null : null);

  const rows = useMemo(
    () =>
      lines
        .map((line) => {
          const inactiveRoles = TAGGED_ROLES.filter((r) => {
            const u = userOf(line[r.field] as string | null);
            return u && u.status === 'Inactive';
          });
          return { line, inactiveRoles };
        })
        .filter((r) => r.inactiveRoles.length > 0),
    [lines, users]
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">MTP with Inactive Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          MTP lines tagged to a user who is now Inactive in User Management — reassign these before they can move
          forward.
        </p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3">Inactive Role(s)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ line, inactiveRoles }) => (
              <tr key={line.id}>
                <td className="px-4 py-3">
                  <StatusBadge status={line.status} />
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{line.description || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{projectOf(line.projectId)?.title || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {inactiveRoles
                    .map((r) => `${r.label}: ${userOf(line[r.field] as string | null)?.name ?? ''}`)
                    .join(', ')}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No MTP lines are tagged to an Inactive user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
