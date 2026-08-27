import type { BudgetKind } from '../types';

const MONTH_KEYS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

export function periodSpan(kind: BudgetKind): number {
  if (kind === 'MTE') return 15;
  if (kind === 'BLOCK') return 5;
  return 12;
}

function fyKey(year: number): string {
  return `FY${String(year % 100).padStart(2, '0')}`;
}

export function periodKeys(kind: BudgetKind, simulationYear: number): string[] {
  if (kind === 'RB' || kind === 'OB') return MONTH_KEYS;
  const span = periodSpan(kind);
  return Array.from({ length: span }, (_, i) => fyKey(simulationYear + i));
}

export function sumPeriods(periods: Record<string, number>): number {
  return Object.values(periods).reduce((sum, v) => sum + (Number(v) || 0), 0);
}
