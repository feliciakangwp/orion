import type { OpsOrDev } from '../types';

export interface MainstreamableLine {
  id: string;
  opsOrDev: OpsOrDev | '';
  periods: Record<string, number>;
  sourceLineCreatedAt: string;
}

// A period key's Financial Year as a full calendar year (FY26 -> 2026).
// Matches fyKey(year) in lib/calc.ts, which labels from the raw calendar
// year with no offset; prefixing 2000 assumes every FY in this app falls
// in the 21st century, which holds for its whole realistic horizon.
function fullYearOf(key: string): number {
  return 2000 + Number(key.slice(2));
}

// Any project funded externally has its spend compared against the total
// "Supported Fund" of its External Source of Funding entries: for each
// Financial Year (in order), the pool pays for that year's Development
// lines first (in the project's own line-creation order), then whatever's
// left pays for Operating lines — any amount beyond the remaining pool,
// for either, is Mainstreaming. Once a FY is past every entry's earliest
// Fund Expiry Date, the whole project's spend for that year (and every
// year after) is Mainstreaming regardless of how much pool is left.
//
// Returns, per line id, a FY-key -> mainstreaming-amount map (only the
// Mainstreaming portion — the external portion is simply periods[key]
// minus this).
export function computeMainstreaming(
  lines: MainstreamableLine[],
  totalSupportedFund: number,
  expiryFY: number | null
): Map<string, Record<string, number>> {
  const sorted = [...lines].sort((a, b) => a.sourceLineCreatedAt.localeCompare(b.sourceLineCreatedAt));
  const result = new Map<string, Record<string, number>>();
  for (const line of sorted) result.set(line.id, {});
  if (sorted.length === 0) return result;

  const keys = Object.keys(sorted[0].periods);
  let remainingPool = totalSupportedFund;

  for (const key of keys) {
    const fy = fullYearOf(key);
    if (expiryFY !== null && fy > expiryFY) {
      for (const line of sorted) result.get(line.id)![key] = Number(line.periods[key] ?? 0);
      continue;
    }
    for (const line of sorted.filter((l) => l.opsOrDev === 'Dev')) {
      const amount = Number(line.periods[key] ?? 0);
      const external = Math.min(amount, Math.max(remainingPool, 0));
      remainingPool -= external;
      result.get(line.id)![key] = amount - external;
    }
    for (const line of sorted.filter((l) => l.opsOrDev !== 'Dev')) {
      const amount = Number(line.periods[key] ?? 0);
      const external = Math.min(amount, Math.max(remainingPool, 0));
      remainingPool -= external;
      result.get(line.id)![key] = amount - external;
    }
  }
  return result;
}
