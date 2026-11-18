import { isFinance, isSuperAdmin } from './workflow';
import type { BudgetExerciseType, BudgetKind, BudgetPeriod, BudgetPeriodStatus, User } from '../types';

export const EXERCISE_LABEL: Record<BudgetExerciseType, string> = {
  MTP: 'Medium Term Projection',
  ANNUAL: 'Annual Budget',
  BLOCK: 'Block Budget',
};

// Annual Budget is one exercise spanning both the Revised Budget (RB) and
// Original Budget (OB) tabs — they're both part of the same annual cycle.
export const KINDS_FOR_EXERCISE: Record<BudgetExerciseType, BudgetKind[]> = {
  MTP: ['MTP'],
  ANNUAL: ['RB', 'OB'],
  BLOCK: ['BLOCK'],
};

export function exerciseTypeForKind(kind: BudgetKind): BudgetExerciseType {
  if (kind === 'MTP') return 'MTP';
  if (kind === 'BLOCK') return 'BLOCK';
  return 'ANNUAL';
}

// The stored state machine only tracks Draft/Open/Locked — "Closed for
// Submission" is derived from Open + the end date having passed, so
// reopening a Locked period naturally resumes whichever of Open/Closed for
// Submission the date already implies, rather than always jumping back to
// a fully-unrestricted Open.
export function effectiveBudgetPeriodStatus(period: BudgetPeriod, todayISODate: string): BudgetPeriodStatus {
  if (period.status === 'Draft') return 'Draft';
  if (period.status === 'Locked') return 'Closed and Locked';
  if (period.endDate && todayISODate > period.endDate) return 'Closed for Submission';
  return 'Open';
}

// Whether `user` may create/edit/submit/approve a budget line governed by a
// period currently in `status`. Draft (no period configured yet, or not yet
// opened) and Open impose no extra restriction beyond the normal workflow
// rules; Closed for Submission restricts to Finance (Officer/Manager, or
// Super Admin); Closed and Locked restricts to Super Admin only — Finance
// Admin manages the period toggle itself but doesn't edit lines through it.
export function canActOnBudgetPeriod(status: BudgetPeriodStatus, user: Pick<User, 'groups'>): boolean {
  if (isSuperAdmin(user)) return true;
  if (status === 'Draft' || status === 'Open') return true;
  if (status === 'Closed for Submission') return isFinance(user);
  return false;
}
