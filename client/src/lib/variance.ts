import { sumPeriods, type InflationRates } from './calc';
import type { BudgetLine, YesNo } from '../types';

export interface YearVariance {
  key: string;
  previous: number;
  current: number;
  amount: number;
  // null means "undefined" (previous was 0) — treated as always exceeding
  // the threshold, matching "the change is definitely more than the %" for
  // a brand-new line with no prior submission.
  percent: number | null;
}

export function varianceForYear(current: number, previous: number): Omit<YearVariance, 'key'> {
  const amount = current - previous;
  if (previous === 0) {
    return { previous, current, amount, percent: current === 0 ? 0 : null };
  }
  return { previous, current, amount, percent: amount / previous };
}

export function yearVariances(line: Pick<BudgetLine, 'periods' | 'previousPeriods'>): YearVariance[] {
  return Object.keys(line.periods).map((key) => ({
    key,
    ...varianceForYear(Number(line.periods[key] ?? 0), Number(line.previousPeriods[key] ?? 0)),
  }));
}

export function exceedsVarianceThreshold(percent: number | null, itProject: YesNo | '', rates: InflationRates): boolean {
  // null only ever means "previous was 0 and current isn't" (see
  // varianceForYear) — i.e. an unambiguous, unconditional variance.
  if (percent === null) return true;
  const threshold = itProject === 'Yes' ? rates.itRate : rates.nonItRate;
  return Math.abs(percent) > threshold;
}

export interface LineVarianceInfo {
  years: YearVariance[];
  // FY keys (in period order) whose variance currently exceeds the
  // threshold.
  flaggedKeys: string[];
  // Only the earliest flagged year actually requires a justification —
  // once it's covered, a later flagged year needs none (per spec).
  requiredJustificationKey: string | null;
  needsVarianceReview: boolean;
}

export function lineVarianceInfo(
  line: Pick<BudgetLine, 'periods' | 'previousPeriods' | 'itProject'>,
  rates: InflationRates
): LineVarianceInfo {
  const years = yearVariances(line);
  const flaggedKeys = years.filter((y) => exceedsVarianceThreshold(y.percent, line.itProject, rates)).map((y) => y.key);
  return {
    years,
    flaggedKeys,
    requiredJustificationKey: flaggedKeys[0] ?? null,
    needsVarianceReview: flaggedKeys.length > 0,
  };
}

// Whether the line's required justification (if any) has actually been
// provided — used both to display the top-level Justification status and
// to block submission until it's filled in.
export function justificationSatisfied(
  line: Pick<BudgetLine, 'periods' | 'previousPeriods' | 'itProject' | 'justifications'>,
  rates: InflationRates
): boolean {
  const { requiredJustificationKey } = lineVarianceInfo(line, rates);
  if (!requiredJustificationKey) return true;
  return !!line.justifications[requiredJustificationKey]?.trim();
}

// ---------- Annual Budget (Revised Budget) variance ----------
// Unlike MTP's per-FY, threshold-gated variance, a Revised Budget line's
// variance is a single total: Approved Original Budget (the sum of what
// was duplicated in from the Original Budget line) minus Total Budget
// Requested (the sum of its current, possibly Branch-Rep-edited, periods).
// Any nonzero amount needs a justification — there's no percentage
// threshold here.

export function approvedOriginalBudgetOf(line: Pick<BudgetLine, 'previousPeriods'>): number {
  return sumPeriods(line.previousPeriods);
}

export function annualVarianceAmount(line: Pick<BudgetLine, 'periods' | 'previousPeriods'>): number {
  return approvedOriginalBudgetOf(line) - sumPeriods(line.periods);
}

export function annualJustificationSatisfied(
  line: Pick<BudgetLine, 'periods' | 'previousPeriods' | 'justificationForVariance'>
): boolean {
  if (annualVarianceAmount(line) === 0) return true;
  return !!line.justificationForVariance?.trim();
}
