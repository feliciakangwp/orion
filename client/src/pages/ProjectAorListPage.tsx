import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency } from '../components/ui';
import { aorTotalApproved } from '../lib/aor';
import { fyOfDate } from '../lib/calc';
import type { Aor, Project } from '../types';

// Project AOR: every Finance-Confirmed AOR the acting user can see (same
// project visibility rule as Project Profile — Branch Rep only sees ones
// for projects they opened or are a team member of; Finance sees every
// one). Highlighted red when its Expired Date falls in the current FY,
// so Branch Rep notices it's about to lapse.
export function ProjectAorListPage() {
  const { currentUser, simulationDate } = useAuth();
  const [aors, setAors] = useState<Aor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();

  function reload() {
    api.aors.listAllConfirmed().then(setAors);
    api.projects.list().then(setProjects);
  }
  useEffect(reload, [currentUser?.id]);

  const projectOf = (id: string) => projects.find((p) => p.id === id);
  const currentFy = fyOfDate(simulationDate);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Project AOR</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every Finance-Confirmed AOR across Project Profiles. A row highlighted red has an AOR expiring this FY —
          raise a top-up or another AOR before it lapses.
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Project Title</th>
              <th className="px-4 py-3 text-right">AOR Total Approved Amount</th>
              <th className="px-4 py-3 text-right">AOR Development Approved Amount</th>
              <th className="px-4 py-3 text-right">Operating Approved Amount</th>
              <th className="px-4 py-3">AOR Start Date</th>
              <th className="px-4 py-3">AOR Expired Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {aors.map((aor) => {
              const expiringThisFy = !!aor.expiredDate && fyOfDate(aor.expiredDate) === currentFy;
              return (
                <tr
                  key={aor.id}
                  className={`cursor-pointer ${expiringThisFy ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-indigo-50/60'}`}
                  onClick={() => navigate(`/projects/aor/${aor.id}`)}
                >
                  <td className={`px-4 py-3 font-medium ${expiringThisFy ? 'text-rose-700' : 'text-indigo-700'}`}>
                    {projectOf(aor.projectId)?.title || '(untitled)'}
                  </td>
                  <td className="px-4 py-3 text-right">{currency(aorTotalApproved(aor))}</td>
                  <td className="px-4 py-3 text-right">{currency(aor.developmentApprovedFund)}</td>
                  <td className="px-4 py-3 text-right">{currency(aor.operatingApprovedFund)}</td>
                  <td className={`px-4 py-3 ${expiringThisFy ? 'font-semibold text-rose-700' : ''}`}>{aor.startDate ?? '—'}</td>
                  <td className={`px-4 py-3 ${expiringThisFy ? 'font-semibold text-rose-700' : ''}`}>{aor.expiredDate ?? '—'}</td>
                </tr>
              );
            })}
            {aors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No Finance-Confirmed AOR yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
