import type { Aor, BudgetLine, OpsOrDev } from '../types';
import { fyOfDate } from './calc';

const MONTH_ORDER = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

export type AorStatus = 'Active' | 'Closed' | 'Expired';

export function aorTotalApproved(aor: Pick<Aor, 'developmentApprovedFund' | 'operatingApprovedFund'>): number {
  return (Number(aor.developmentApprovedFund) || 0) + (Number(aor.operatingApprovedFund) || 0);
}

// "Year" is always derived from Start Date, never its own input field.
export function aorYear(aor: Pick<Aor, 'startDate'>): number | null {
  return aor.startDate ? fyOfDate(aor.startDate) : null;
}

export interface AorMonthlySpend {
  year: number;
  monthKey: string;
  development: number;
  operating: number;
}

// Every Original Budget line's monthly periods for a project, grouped by
// (Submission Year, month) and split Development/Operating — the
// "transaction of the monthly expense" that knocks off an AOR's balance.
// Spend accumulates across every Annual Budget cycle ever run for the
// project (not just the current one), since an AOR's balance is a
// lifetime ledger, not a per-cycle one.
export function monthlySpendForProject(
  obLines: Array<Pick<BudgetLine, 'periods' | 'opsOrDev' | 'submissionYear'>>
): AorMonthlySpend[] {
  const byKey = new Map<string, AorMonthlySpend>();
  for (const line of obLines) {
    const year = line.submissionYear ?? 0;
    for (const monthKey of Object.keys(line.periods)) {
      const key = `${year}-${monthKey}`;
      const entry = byKey.get(key) ?? { year, monthKey, development: 0, operating: 0 };
      const amount = Number(line.periods[monthKey]) || 0;
      if (line.opsOrDev === 'Dev') entry.development += amount;
      else if (line.opsOrDev === 'Ops') entry.operating += amount;
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => a.year - b.year || MONTH_ORDER.indexOf(a.monthKey) - MONTH_ORDER.indexOf(b.monthKey));
}

export interface AorBalance {
  developmentSpent: number;
  operatingSpent: number;
  developmentRemaining: number;
  operatingRemaining: number;
  status: AorStatus;
}

// Every project's AORs form a single waterfall per fund type (earliest
// Start Date first, as pre-sorted by the caller): the project's total
// Development spend (summed across every Original Budget line, every
// cycle) knocks off against the first AOR's Development fund, then
// whatever's left spills into the next AOR, and so on — independently
// for Operating. "Closed" means this AOR's own balance (both funds) is
// fully consumed; otherwise "Expired" once its own Expired Date has
// passed; otherwise "Active".
export function aorBalances(
  sortedAorsForProject: Array<Pick<Aor, 'id' | 'developmentApprovedFund' | 'operatingApprovedFund' | 'expiredDate'>>,
  monthlySpend: AorMonthlySpend[],
  todayISODate: string
): Map<string, AorBalance> {
  const totalDev = monthlySpend.reduce((s, m) => s + m.development, 0);
  const totalOps = monthlySpend.reduce((s, m) => s + m.operating, 0);
  const result = new Map<string, AorBalance>();
  let remainingDevSpend = totalDev;
  let remainingOpsSpend = totalOps;
  for (const aor of sortedAorsForProject) {
    const devUsed = Math.min(remainingDevSpend, aor.developmentApprovedFund);
    const opsUsed = Math.min(remainingOpsSpend, aor.operatingApprovedFund);
    remainingDevSpend -= devUsed;
    remainingOpsSpend -= opsUsed;
    const developmentRemaining = aor.developmentApprovedFund - devUsed;
    const operatingRemaining = aor.operatingApprovedFund - opsUsed;
    let status: AorStatus;
    if (developmentRemaining <= 0 && operatingRemaining <= 0) {
      status = 'Closed';
    } else if (aor.expiredDate && todayISODate > aor.expiredDate) {
      status = 'Expired';
    } else {
      status = 'Active';
    }
    result.set(aor.id, { developmentSpent: devUsed, operatingSpent: opsUsed, developmentRemaining, operatingRemaining, status });
  }
  return result;
}

// Whether a project's Development/Operating pool (summed across every
// AOR for it — confirmed or not, since this is a live knock-off check,
// not the confirmed-only Project AOR listing) currently has enough
// headroom for its current Original Budget spend of that type. This is a
// simple pooled total, not the waterfall above, since the warning only
// needs "is there enough overall", not which specific AOR covers it.
export function hasInsufficientAorBalance(
  type: OpsOrDev | '',
  aorsForProject: Array<Pick<Aor, 'developmentApprovedFund' | 'operatingApprovedFund'>>,
  totalSpendOfType: number
): boolean {
  if (type !== 'Dev' && type !== 'Ops') return false;
  const approved = aorsForProject.reduce(
    (sum, a) => sum + (type === 'Dev' ? a.developmentApprovedFund : a.operatingApprovedFund),
    0
  );
  return totalSpendOfType > approved;
}
