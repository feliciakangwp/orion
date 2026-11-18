import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/ui';
import { BudgetLinesTab } from '../tabs/BudgetLinesTab';
import { DetailsTab } from '../tabs/DetailsTab';
import { SourceOfFundingTab } from '../tabs/SourceOfFundingTab';
import { TeamMembersTab } from '../tabs/TeamMembersTab';
import type { Project } from '../types';

const TABS = [
  { key: 'Details', label: 'Details' },
  { key: 'Source of Funding', label: 'Source of Funding' },
  { key: 'MTP', label: 'MTP' },
  { key: 'RB', label: 'Revised Budget' },
  { key: 'OB', label: 'Original Budget' },
  { key: 'Block', label: 'Block Budget' },
  { key: 'Team Members', label: 'Team Members' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<TabKey>('Details');

  function reload() {
    if (id) api.projects.get(id).then(setProject);
  }
  useEffect(reload, [id]);

  if (!project || !id) {
    return <div className="text-slate-400">Loading…</div>;
  }

  return (
    <div>
      <Link to="/projects" className="text-sm text-indigo-600 hover:underline">
        &larr; Project Profile
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800 break-words">{project.title || '(untitled project)'}</h1>
        <StatusBadge status={project.status} />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium sm:px-4 ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'Details' && <DetailsTab project={project} onChange={reload} />}
      {tab === 'Source of Funding' && <SourceOfFundingTab project={project} />}
      {tab === 'MTP' && <BudgetLinesTab project={project} kind="MTP" />}
      {tab === 'RB' && <BudgetLinesTab project={project} kind="RB" />}
      {tab === 'OB' && <BudgetLinesTab project={project} kind="OB" />}
      {tab === 'Block' && <BudgetLinesTab project={project} kind="BLOCK" />}
      {tab === 'Team Members' && <TeamMembersTab project={project} />}
    </div>
  );
}
