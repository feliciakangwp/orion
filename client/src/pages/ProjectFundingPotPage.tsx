import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Card, currency, StatusBadge } from '../components/ui';
import { fyKey } from '../lib/calc';
import type { FundingEntry, FundingSource, Project } from '../types';

type PotStatus = 'Active' | 'Closed' | 'Expired';

interface PotRow {
  entry: FundingEntry;
  project: Project;
  sourceName: string;
  drawDownByYear: Map<number, number>;
  totalDrawnDown: number;
  balance: number;
  status: PotStatus;
}

// Project Funding Pot: every Approved Source of Funding entry (a Pipeline
// one isn't a real pot yet) across every visible Project Profile (same
// project-visibility rule as Project Profile itself, inherited from
// iterating projects.list()), with how much of its own Supported Fund has
// been drawn down by that project's Original Budget — pooled at the
// project level (not per budget line's own fundingEntryId), matching how
// the AOR insufficient-balance check is also a pooled, project-level
// figure rather than tracked per individual line.
export function ProjectFundingPotPage() {
  const { currentUser, simulationDate } = useAuth();
  const [rows, setRows] = useState<PotRow[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    Promise.all([api.projects.list(), api.fundingCatalog.list()]).then(async ([projects, catalog]: [Project[], FundingSource[]]) => {
      const perProject = await Promise.all(
        projects.map(async (project) => {
          const [entries, obLines] = await Promise.all([
            api.funding.list(project.id),
            api.budgetLines.listAllForProject(project.id, 'OB'),
          ]);
          return { project, entries, obLines };
        })
      );
      const yearSet = new Set<number>();
      const allRows: PotRow[] = [];
      for (const { project, entries, obLines } of perProject) {
        // Every Original Budget line this project has ever had, across
        // every Annual Budget cycle — not just the one currently in view
        // (see belongsToCurrentCycle) — summed by the FY it was submitted
        // for, same "lifetime ledger" approach as the AOR balance check.
        const drawDownByYear = new Map<number, number>();
        for (const line of obLines) {
          if (line.submissionYear == null) continue;
          drawDownByYear.set(line.submissionYear, (drawDownByYear.get(line.submissionYear) ?? 0) + line.total);
          yearSet.add(line.submissionYear);
        }
        const totalDrawnDown = [...drawDownByYear.values()].reduce((a, b) => a + b, 0);
        for (const entry of entries) {
          const source = catalog.find((c) => c.id === entry.fundingSourceId);
          // Only an Approved funding pot belongs here — a Pipeline entry
          // isn't a real pot yet (and an External one can't even reach
          // Approved without its pot details already filled in — see
          // funding.update()).
          if (source?.maturity !== 'Approved') continue;
          const balance = entry.supportedFund - totalDrawnDown;
          let status: PotStatus;
          if (balance <= 0) status = 'Closed';
          else if (entry.fundExpiryDate && simulationDate > entry.fundExpiryDate) status = 'Expired';
          else status = 'Active';
          allRows.push({ entry, project, sourceName: source?.name ?? '—', drawDownByYear, totalDrawnDown, balance, status });
        }
      }
      setYears([...yearSet].sort((a, b) => a - b));
      setRows(allRows);
      setLoading(false);
    });
  }
  useEffect(reload, [currentUser?.id]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Project Funding Pot</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every Approved funding pot across Project Profiles — a Pipeline entry isn't a real pot yet — with how
          much of its Supported Fund has been drawn down by that project's Original Budget each FY. Funding Pot
          Balance is Supported Fund minus Total Budget Drawn Down.
        </p>
      </div>
      <p className="mb-2 text-xs text-slate-400 sm:hidden">Swipe the table sideways to see more columns.</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Funding Pot ID</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Project Title</th>
              <th className="px-3 py-2">Source of Funding</th>
              <th className="px-3 py-2">External Fund Start Date</th>
              <th className="px-3 py-2">External Fund End Date</th>
              <th className="px-3 py-2 text-right">Supported Fund</th>
              <th className="px-3 py-2 text-right">Funding Pot Balance</th>
              <th className="px-3 py-2 text-right">Total Budget Drawn Down</th>
              {years.map((y) => (
                <th key={y} className="px-2 py-2 text-right">
                  {fyKey(y)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.entry.id}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm text-slate-700">{row.entry.fundingPotId || '—'}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2 text-sm text-slate-700">{row.project.title}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{row.sourceName}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{row.entry.fundStartDate ?? '—'}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{row.entry.fundExpiryDate ?? '—'}</td>
                <td className="px-3 py-2 text-right text-sm font-medium text-slate-700">{currency(row.entry.supportedFund)}</td>
                <td className={`px-3 py-2 text-right text-sm font-medium ${row.balance < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {currency(row.balance)}
                </td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">{currency(row.totalDrawnDown)}</td>
                {years.map((y) => (
                  <td key={y} className="px-2 py-2 text-right text-xs text-slate-600">
                    {row.drawDownByYear.has(y) ? currency(row.drawDownByYear.get(y)!) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9 + years.length} className="px-4 py-8 text-center text-slate-400">
                  No Approved funding pots yet — Finance approves a Source of Funding on a Project Profile's Source
                  of Funding tab (an External one needs its pot details filled in first).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
