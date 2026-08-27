import type { BudgetKind, YesNo } from '../types.js';

const MONTH_KEYS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

export function periodSpan(kind: BudgetKind): number {
  if (kind === 'MTE') return 15;
  if (kind === 'BLOCK') return 5;
  return 12; // RB / OB
}

// FY key for a given calendar year, e.g. 2026 -> "FY26"
function fyKey(year: number): string {
  return `FY${String(year % 100).padStart(2, '0')}`;
}

// Returns the ordered list of period keys for a budget line, given the
// project's simulation year (used for MTE/BLOCK) or fixed months (RB/OB).
export function periodKeys(kind: BudgetKind, simulationYear: number): string[] {
  if (kind === 'RB' || kind === 'OB') return MONTH_KEYS;
  const span = periodSpan(kind);
  return Array.from({ length: span }, (_, i) => fyKey(simulationYear + i));
}

export function emptyPeriods(kind: BudgetKind, simulationYear: number): Record<string, number> {
  const keys = periodKeys(kind, simulationYear);
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

export function inflationRate(recurring: YesNo | '', itProject: YesNo | ''): number | null {
  if (recurring !== 'Yes') return null;
  return itProject === 'Yes' ? 0.05 : 0.03;
}

// Given the first period's base amount, auto-populate the remaining periods
// with year-over-year inflation when the line is recurring. Non-recurring
// lines are left untouched (each period independently keyed in).
export function applyRecurringInflation(
  kind: BudgetKind,
  simulationYear: number,
  recurring: YesNo | '',
  itProject: YesNo | '',
  baseAmount: number
): Record<string, number> {
  const keys = periodKeys(kind, simulationYear);
  const rate = inflationRate(recurring, itProject);
  const periods: Record<string, number> = {};
  keys.forEach((key, i) => {
    if (i === 0) {
      periods[key] = baseAmount;
    } else if (rate != null) {
      periods[key] = Math.round(baseAmount * Math.pow(1 + rate, i) * 100) / 100;
    } else {
      periods[key] = 0;
    }
  });
  return periods;
}

export function sumPeriods(periods: Record<string, number>): number {
  return Object.values(periods).reduce((sum, v) => sum + (Number(v) || 0), 0);
}
