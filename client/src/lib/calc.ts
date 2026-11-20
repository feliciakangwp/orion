import type { BudgetKind, YesNo } from '../types';

const MONTH_KEYS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

export function periodSpan(kind: BudgetKind): number {
  if (kind === 'MTP') return 15;
  if (kind === 'BLOCK') return 5;
  return 12;
}

function fyKey(year: number): string {
  return `FY${String(year % 100).padStart(2, '0')}`;
}

// Every Financial Year runs April to March: FYn starts 1 Apr of calendar
// year n and ends 31 Mar of calendar year n+1 (matching fyKey(year) above,
// where the first MTP/Block period column is labelled directly from the
// window's starting calendar year with no +1 offset).
export function fyOfDate(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan
  return month >= 3 ? year : year - 1;
}

export function periodKeys(kind: BudgetKind, simulationYear: number): string[] {
  if (kind === 'RB' || kind === 'OB') return MONTH_KEYS;
  const span = periodSpan(kind);
  return Array.from({ length: span }, (_, i) => fyKey(simulationYear + i));
}

export function emptyPeriods(kind: BudgetKind, simulationYear: number): Record<string, number> {
  const keys = periodKeys(kind, simulationYear);
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

// Fractions (e.g. 0.03 for 3%), sourced live from Finance Admin's Inflation
// Rate table (see lib/variance.ts / api.ts) rather than hardcoded, so
// editing that table changes both recurring-line growth and the MTP
// Variance justification threshold.
export interface InflationRates {
  nonItRate: number;
  itRate: number;
}

export function inflationRate(recurring: YesNo | '', itProject: YesNo | '', rates: InflationRates): number | null {
  if (recurring !== 'Yes') return null;
  return itProject === 'Yes' ? rates.itRate : rates.nonItRate;
}

export function applyRecurringInflation(
  kind: BudgetKind,
  simulationYear: number,
  recurring: YesNo | '',
  itProject: YesNo | '',
  baseAmount: number,
  rates: InflationRates
): Record<string, number> {
  const keys = periodKeys(kind, simulationYear);
  const rate = inflationRate(recurring, itProject, rates);
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

// Fin Supported rounding: to the nearest 100, except a figure under 100
// (in absolute value) is left exactly as it is.
export function roundToNearestHundred(value: number): number {
  return Math.abs(value) < 100 ? value : Math.round(value / 100) * 100;
}
