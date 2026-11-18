import type { ReactNode } from 'react';
import { useAuth } from '../AuthContext';
import { isSuperAdmin } from '../lib/workflow';
import type { Group } from '../types';

export function RequireGroup({ group, children }: { group: Group; children: ReactNode }) {
  const { currentUser } = useAuth();
  const allowed = !!currentUser && (currentUser.groups.includes(group) || isSuperAdmin(currentUser));
  if (!allowed) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        This page is only available to the <span className="font-semibold">{group}</span> group (or Super Admin).
        You&rsquo;re currently impersonating <span className="font-semibold">{currentUser?.name ?? 'no one'}</span>,
        who doesn&rsquo;t have either.
      </div>
    );
  }
  return <>{children}</>;
}
