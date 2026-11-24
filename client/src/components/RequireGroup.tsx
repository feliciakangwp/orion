import type { ReactNode } from 'react';
import { useAuth } from '../AuthContext';
import { isSuperAdmin } from '../lib/workflow';
import type { Group } from '../types';

export function RequireGroup({ group, children }: { group: Group | Group[]; children: ReactNode }) {
  const { currentUser } = useAuth();
  const groups = Array.isArray(group) ? group : [group];
  const allowed = !!currentUser && (groups.some((g) => currentUser.groups.includes(g)) || isSuperAdmin(currentUser));
  if (!allowed) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        This page is only available to the <span className="font-semibold">{groups.join(' or ')}</span> group (or
        Super Admin). You&rsquo;re currently impersonating{' '}
        <span className="font-semibold">{currentUser?.name ?? 'no one'}</span>, who doesn&rsquo;t have either.
      </div>
    );
  }
  return <>{children}</>;
}
