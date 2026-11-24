// Pure client-side, in-browser implementation of the ORION API.
//
// This runs entirely in localStorage (see local/db.ts) instead of calling a
// server — there is no backend to deploy. Every permission/workflow rule is
// enforced here against whichever User is currently "impersonated" (see
// AuthContext.tsx), the same way a real server would enforce it against a
// logged-in session.
import { getDb, nextId, resetDb, saveDb, type StoredBudgetLine } from './local/db';
import { applyRecurringInflation, emptyPeriods, fyKey, fyOfDate, periodKeys, roundToNearestHundred, sumPeriods, type InflationRates } from './lib/calc';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus, exerciseTypeForKind, EXERCISE_LABEL } from './lib/budgetPeriod';
import { computeMainstreaming } from './lib/mainstreaming';
import { annualJustificationSatisfied, blockJustificationSatisfied, justificationSatisfied } from './lib/variance';
import {
  canApprove,
  canCreateProject,
  canEditFinSupported,
  canManageFinanceAdminCatalog,
  canReject,
  canSeeLine,
  canSeeProject,
  canSubmit,
  isEditableByBranchRep,
  isFinance,
  isFinanceOrFinanceAdmin,
  isOwningBranchRep,
  isSuperAdmin,
  nextOnApprove,
  nextOnReject,
  nextOnSubmit,
  statusFor,
  STEP_ACTOR,
  userCanAct,
} from './lib/workflow';
import type {
  AccountCode,
  AccountLevel,
  Aor,
  BudgetExerciseType,
  BudgetKind,
  BudgetLine,
  BudgetPeriod,
  CostCentreCode,
  CostCentreType,
  Division,
  ExpenditureNature,
  FinSupportedLine,
  FundingEntry,
  FundingSource,
  Group,
  HistoryEntry,
  IctExpenditureCategory,
  LoanPot,
  Project,
  SubAccountCode,
  TeamMember,
  User,
  WorkflowStep,
} from './types';

let currentUserId: string | null = null;

export function setApiUser(id: string | null) {
  currentUserId = id;
}

// The global "pretend today is this date" setting (top bar) — budget period
// gating (Closed for Submission / Closed and Locked) is evaluated against
// this rather than the real browser date, same simulated-time approach the
// rest of the app already uses for the Simulation Year.
let currentSimDate: string = new Date().toISOString().slice(0, 10);

export function setApiSimDate(date: string) {
  currentSimDate = date;
}

function now() {
  return new Date().toISOString();
}

function requireUser(): User {
  const user = getDb().users.find((u) => u.id === currentUserId);
  if (!user) throw new Error('Missing or unknown acting user');
  return user;
}

function getProjectOrThrow(id: string): Project {
  const project = getDb().projects.find((p) => p.id === id);
  if (!project) throw new Error('Not found');
  return project;
}

function getFundingSourceOrThrow(id: string): FundingSource {
  const source = getDb().fundingSources.find((f) => f.id === id);
  if (!source) throw new Error('Invalid Source of Funding');
  return source;
}

function getBudgetPeriod(type: BudgetExerciseType): BudgetPeriod {
  const period = getDb().budgetPeriods.find((p) => p.type === type);
  if (!period) throw new Error('Not found');
  return period;
}

// Live rates from Finance Admin's Inflation Rate table, as fractions —
// drives both recurring-line auto-growth and the MTP Variance
// justification threshold.
function getInflationRates(): InflationRates {
  const rows = getDb().inflationRates;
  const nonIt = rows.find((r) => r.item === 'Non IT Item')?.value ?? 3;
  const it = rows.find((r) => r.item === 'IT Item')?.value ?? 5;
  return { nonItRate: nonIt / 100, itRate: it / 100 };
}

// Throws if the acting user isn't allowed to create/edit/submit/approve a
// budget line of this kind right now, given its budget exercise's current
// status (Draft/Open impose no extra restriction; Closed for Submission
// restricts to Finance; Closed and Locked restricts to Super Admin only).
function requireBudgetPeriodEditable(kind: BudgetKind, user: User) {
  const type = exerciseTypeForKind(kind);
  const period = getBudgetPeriod(type);
  const status = effectiveBudgetPeriodStatus(period, currentSimDate);
  if (!canActOnBudgetPeriod(status, user)) {
    if (status === 'Closed and Locked') {
      throw new Error(`${EXERCISE_LABEL[type]} is Closed and Locked. Only Finance Admin can reopen it for edits.`);
    }
    throw new Error(`${EXERCISE_LABEL[type]} is Closed for Submission. Only Finance Officer or Finance Manager can still edit.`);
  }
}

// A line's "owning project" for permission purposes — a real Project for a
// line tied to one, or a synthesized minimal stand-in (just the shape
// isOwningBranchRep/userCanAct need) for an ad hoc line with no Project
// Profile at all, owned by whoever it's assigned to.
function owningProjectOf(line: Pick<StoredBudgetLine, 'projectId' | 'assignedToUserId'>): { openedByUserId: string } {
  return line.projectId ? getProjectOrThrow(line.projectId) : { openedByUserId: line.assignedToUserId };
}

// The current cycle's Revised Budget FY — the Annual Budget exercise's
// Start Date's FY, if it's currently active (Open, Closed for Submission,
// or Closed and Locked) — null while it's still Draft (never opened), same
// as how an ad hoc MTP line has no FY concept. Original Budget is always
// exactly one FY ahead of this (see rollAnnualBudgetForward): e.g. opening
// the cycle in FY26 gives a Revised Budget for FY26 and an Original Budget
// for FY27.
function currentRevisedBudgetYear(): number | null {
  const period = getBudgetPeriod('ANNUAL');
  return period.startDate ? fyOfDate(period.startDate) : null;
}
function currentOriginalBudgetYear(): number | null {
  const year = currentRevisedBudgetYear();
  return year === null ? null : year + 1;
}

// The Financial Year a freshly (hand-)created RB/OB line belongs to —
// null for MTP/Block, which have no FY-submission concept.
function submissionYearFor(kind: BudgetKind): number | null {
  if (kind === 'RB') return currentRevisedBudgetYear();
  if (kind === 'OB') return currentOriginalBudgetYear();
  return null;
}

// MTP rolls every line forward in place (same id, new periods each cycle),
// so there's only ever one row per MTP line regardless of how many MTP
// cycles have run. RB/OB instead get a brand-new record every Annual
// Budget cycle (see rollAnnualBudgetForward) — without this filter, every
// past cycle's lines would stay visible forever alongside the current
// one. MTP/Block lines (submissionYear always null) pass through
// unfiltered.
function belongsToCurrentCycle(line: Pick<StoredBudgetLine, 'kind' | 'submissionYear'>): boolean {
  if (line.kind === 'RB') return line.submissionYear === currentRevisedBudgetYear();
  if (line.kind === 'OB') return line.submissionYear === currentOriginalBudgetYear();
  return true;
}

export type FyBalanceStatus = 'Balanced' | 'Deficit' | 'Excess';

export interface ExternalProjectFyStatus {
  project: Project;
  fy: number; // the Original Budget FY being evaluated — currentOriginalBudgetYear() at the time this was read
  fyOriginalBudget: number;
  fyRevisedBudget: number;
  difference: number; // Original minus Revised
  status: FyBalanceStatus;
  totalLoanAmount: number; // sum of every open-or-closed loan where this project is the borrower (loanTo)
}

// Project FY Status (External): every Project Profile with at least one
// Approved, External Source of Funding entry, with this cycle's total
// Original Budget vs. total Revised Budget (both summed across every
// line for the project, any sourceMtpLineId) and the Loan Pot exposure
// that follows from the difference. Shared by the Project FY Status
// (External) page and Project Loan Pot's own "New" dropdowns/validation,
// so both always agree on who currently has Excess/Deficit.
function computeExternalProjectFyStatuses(db: ReturnType<typeof getDb>): ExternalProjectFyStatus[] {
  const obYear = currentOriginalBudgetYear();
  const rbYear = currentRevisedBudgetYear();
  if (obYear === null || rbYear === null) return [];
  const results: ExternalProjectFyStatus[] = [];
  for (const project of db.projects) {
    const hasApprovedExternalFunding = db.fundingEntries.some((entry) => {
      if (entry.projectId !== project.id) return false;
      const source = db.fundingSources.find((s) => s.id === entry.fundingSourceId);
      return source?.category === 'External' && source.maturity === 'Approved';
    });
    if (!hasApprovedExternalFunding) continue;
    const fyOriginalBudget = db.budgetLines
      .filter((l) => l.kind === 'OB' && l.projectId === project.id && l.submissionYear === obYear)
      .reduce((sum, l) => sum + sumPeriods(l.periods), 0);
    const fyRevisedBudget = db.budgetLines
      .filter((l) => l.kind === 'RB' && l.projectId === project.id && l.submissionYear === rbYear)
      .reduce((sum, l) => sum + sumPeriods(l.periods), 0);
    const difference = fyOriginalBudget - fyRevisedBudget;
    const status: FyBalanceStatus = difference === 0 ? 'Balanced' : difference < 0 ? 'Deficit' : 'Excess';
    const totalLoanAmount = db.loanPots.filter((l) => l.loanToProjectId === project.id).reduce((sum, l) => sum + l.loanAmount, 0);
    results.push({ project, fy: obYear, fyOriginalBudget, fyRevisedBudget, difference, status, totalLoanAmount });
  }
  return results;
}

// Whether `fy`'s Original Budget is no longer reachable for a fresh line
// to land in and still be actionable: either the exercise has already
// cycled past it entirely, or it's the exercise's current FY but that
// cycle is now Closed and Locked. A future FY the exercise hasn't reached
// yet is never "closed" — it'll simply become current (and so editable)
// once Annual Budget naturally cycles forward to it.
function isFyClosedForOb(fy: number): boolean {
  const curOb = currentOriginalBudgetYear();
  if (curOb === null) return false;
  if (fy < curOb) return true;
  if (fy === curOb) return getBudgetPeriod('ANNUAL').status === 'Locked';
  return false;
}

// An even monthly spread of `total` across OB's 12 months for `year` —
// used for a Loan Pot's auto-created "Return Loan"/"Return from Loan"
// lines, same rounding approach loadSampleData's own monthly() helper
// uses for hand-built Original Budget figures.
function flatMonthly(year: number, total: number): Record<string, number> {
  const keys = periodKeys('OB', year);
  const per = Math.round((total / keys.length) * 100) / 100;
  return Object.fromEntries(keys.map((k) => [k, per]));
}

// projectId -> every userId who's a team member of it — shared by every
// visibility check (budget lines, Project Profile listing, Project AOR
// listing) that needs to know "is this user a team member of project X".
function teamMembersByProject(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of getDb().teamMembers) {
    const arr = map.get(m.projectId) ?? [];
    arr.push(m.userId);
    map.set(m.projectId, arr);
  }
  return map;
}

// Shared by listAllMtp (kinds=['MTP']) and the Annual Budget Revised/
// Original Budget Line Item pages (kinds=['RB','OB']): every line of these
// kinds the acting user can see, whether tied to a Project Profile or ad
// hoc (projectId === null).
function listByKindsImpl(kinds: BudgetKind[]): BudgetLine[] {
  const user = requireUser();
  const db = getDb();
  const teamMembersByProject = new Map<string, string[]>();
  for (const m of db.teamMembers) {
    const arr = teamMembersByProject.get(m.projectId) ?? [];
    arr.push(m.userId);
    teamMembersByProject.set(m.projectId, arr);
  }
  return db.budgetLines
    .filter((l) => kinds.includes(l.kind))
    .filter(belongsToCurrentCycle)
    .filter((l) => canSeeLine(l, user, l.projectId ? teamMembersByProject.get(l.projectId) ?? [] : []))
    .map(withComputed);
}

function withComputed(line: StoredBudgetLine): BudgetLine {
  return { ...line, status: statusFor(line), total: sumPeriods(line.periods) };
}

function pushHistory(line: StoredBudgetLine, byUserId: string, action: string, from: WorkflowStep, to: WorkflowStep, note?: string) {
  const entry: HistoryEntry = { at: now(), byUserId, action, fromStep: from, toStep: to, note };
  line.history.push(entry);
}

// Simulates network latency-free async calls so call sites (`await api.x()`)
// keep working the same as a real fetch-based client would.
//
// The returned value is deep-cloned (mirroring the JSON round-trip a real
// fetch response would have gone through) rather than handed back as a live
// reference into the singleton store. Without this, mutating an object in
// place and then returning that same reference means React's setState sees
// Object.is(prev, next) === true and silently skips the re-render.
// Rolls every existing MTP-kind budget line forward into a new 15-year
// window starting at `newStartYear`, pulling over whatever overlapping FY
// values already exist (same FY label = same value, no shifting needed)
// and auto-populating the one new year at the end: for a recurring line
// that's just continuing its existing growth formula one more year (which,
// since a recurring line's periods are always kept consistent with that
// formula, also reproduces the correct carried-over values for every
// overlapping year); for a non-recurring line the new year starts at 0,
// same as any other blank period. Each line's workflow also resets to
// Draft so the Branch Rep can edit it for the new cycle, and
// `previousPeriods` is frozen to this exact just-rolled snapshot — MTP
// Variance only flags a year once the Branch Rep's own edits make it
// diverge from here, not the rollover itself.
function rollMtpLinesForward(newStartYear: number, byUserId: string) {
  const db = getDb();
  const newKeys = periodKeys('MTP', newStartYear);
  const rates = getInflationRates();
  for (const line of db.budgetLines) {
    if (line.kind !== 'MTP') continue;
    const oldPeriods = line.periods;
    let newPeriods: Record<string, number>;
    if (line.recurring === 'Yes') {
      const oldFirstKey = Object.keys(oldPeriods)[0];
      const baseAmount = Number(oldPeriods[newKeys[0]] ?? oldPeriods[oldFirstKey] ?? 0);
      newPeriods = applyRecurringInflation('MTP', newStartYear, 'Yes', line.itProject, baseAmount, rates);
    } else {
      newPeriods = {};
      for (const key of newKeys) newPeriods[key] = oldPeriods[key] ?? 0;
    }
    line.periods = newPeriods;
    line.previousPeriods = { ...newPeriods };
    line.justifications = {};
    const from = line.step;
    line.step = 'DRAFT';
    pushHistory(line, byUserId, 'rollover', from, line.step, `Rolled forward to the ${newKeys[0]}–${newKeys[newKeys.length - 1]} Medium Term Projection window`);
    line.updatedAt = now();
  }
}

// Finance Admin opens Annual Budget: Revised Budget is always for the
// *current* FY (the cycle's own Start Date FY — `newCurrentYear` below);
// Original Budget is always for *next* FY (`newCurrentYear + 1`) — e.g.
// opening the cycle in FY26 gives a Revised Budget for FY26 and an
// Original Budget for FY27 ("FY26 Original Budget was done in FY25",
// i.e. last cycle's Original Budget, which was for FY26, is exactly this
// cycle's Revised Budget baseline).
//
// This builds this cycle's Revised Budget lines as a plain duplicate of
// last cycle's Original Budget lines (Branch Rep edits from there — the
// duplicate's own total, frozen into previousPeriods, is "Approved
// Original Budget"; see lib/variance.ts), and separately rebuilds this
// cycle's Original Budget lines by syncing against the current Medium
// Term Projection's FY(current+1) column: a last-cycle Original Budget
// line whose parent MTP line now has a zero amount there (or was removed
// entirely) is dropped, and an MTP line with no existing Original Budget
// counterpart gets a brand-new one, catalog fields pulled down, periods
// starting at zero ("no comparison" — Branch Rep fills them in from
// scratch). Last cycle's lines are matched by `submissionYear ===
// newCurrentYear` (they were created "for" this exact FY), not "every
// Original Budget line ever", so this also cleanly handles the
// first-ever cycle: no matching lines exist yet, so Revised Budget starts
// empty and Original Budget is built entirely fresh from current MTP
// lines.
function rollAnnualBudgetForward(newCurrentYear: number, byUserId: string) {
  const db = getDb();
  const newOriginalYear = newCurrentYear + 1;
  const newMtpFyKey = fyKey(newOriginalYear);
  const lastCycleOriginal = db.budgetLines.filter((l) => l.kind === 'OB' && l.submissionYear === newCurrentYear);

  function freshLine(
    kind: 'RB' | 'OB',
    submissionYear: number,
    source: Pick<
      StoredBudgetLine,
      | 'projectId'
      | 'description'
      | 'opsOrDev'
      | 'account'
      | 'subAcct'
      | 'fundingEntryId'
      | 'recurring'
      | 'costCentre'
      | 'itProject'
      | 'ictExp'
      | 'buildOrBuy'
      | 'basis'
      | 'assignedToUserId'
    >,
    periods: Record<string, number>,
    previousPeriods: Record<string, number>,
    sourceMtpLineId: string | null
  ): StoredBudgetLine {
    return {
      id: nextId('line'),
      projectId: source.projectId,
      kind,
      step: 'DRAFT',
      description: source.description,
      opsOrDev: source.opsOrDev,
      account: source.account,
      subAcct: source.subAcct,
      fundingEntryId: source.fundingEntryId,
      recurring: source.recurring,
      costCentre: source.costCentre,
      itProject: source.itProject,
      ictExp: source.ictExp,
      buildOrBuy: source.buildOrBuy,
      basis: source.basis,
      budgetType: kind,
      periods,
      previousPeriods,
      justifications: {},
      justificationForVariance: '',
      submissionYear,
      sourceMtpLineId,
      assignedToUserId: source.assignedToUserId,
      reviewer1UserId: null,
      reviewer2UserId: null,
      approverUserId: null,
      financeOfficerUserId: null,
      history: [],
      createdAt: now(),
      updatedAt: now(),
    };
  }

  // 1. Revised Budget (FY = newCurrentYear): plain duplicate of last
  // cycle's Original Budget lines (which were for this exact FY).
  for (const ob of lastCycleOriginal) {
    const rb = freshLine('RB', newCurrentYear, ob, { ...ob.periods }, { ...ob.periods }, ob.sourceMtpLineId);
    db.budgetLines.push(rb);
    pushHistory(rb, byUserId, 'rollover', 'DRAFT', 'DRAFT', `Duplicated from FY${String(newCurrentYear % 100).padStart(2, '0')} Original Budget`);
  }

  // 2. Original Budget (FY = newOriginalYear = newCurrentYear + 1): carry
  // forward every one of last cycle's Original Budget lines whose parent
  // MTP line (if any) still has a nonzero amount for FY(newOriginalYear).
  const mtpLines = db.budgetLines.filter((l) => l.kind === 'MTP');
  const mirroredMtpIds = new Set(lastCycleOriginal.map((l) => l.sourceMtpLineId).filter((x): x is string => !!x));
  for (const ob of lastCycleOriginal) {
    if (ob.sourceMtpLineId) {
      const parent = mtpLines.find((m) => m.id === ob.sourceMtpLineId);
      const parentFyAmount = parent ? Number(parent.periods[newMtpFyKey] ?? 0) : 0;
      if (!parent || parentFyAmount === 0) continue; // zeroed out (or removed) in MTP — drop this line
    }
    const emptyOb = emptyPeriods('OB', newOriginalYear);
    const newOb = freshLine('OB', newOriginalYear, ob, { ...emptyOb }, { ...emptyOb }, ob.sourceMtpLineId);
    db.budgetLines.push(newOb);
    pushHistory(newOb, byUserId, 'rollover', 'DRAFT', 'DRAFT', 'Carried forward from last FY Original Budget');
  }

  // New MTP lines not yet mirrored into Original Budget, with a nonzero
  // amount for FY(newOriginalYear): add them fresh, catalog fields pulled
  // down.
  for (const mtp of mtpLines) {
    if (mirroredMtpIds.has(mtp.id)) continue;
    const fyAmount = Number(mtp.periods[newMtpFyKey] ?? 0);
    if (fyAmount === 0) continue;
    const emptyOb = emptyPeriods('OB', newOriginalYear);
    const newOb = freshLine('OB', newOriginalYear, mtp, { ...emptyOb }, { ...emptyOb }, mtp.id);
    db.budgetLines.push(newOb);
    pushHistory(newOb, byUserId, 'rollover', 'DRAFT', 'DRAFT', 'Added from Medium Term Projection');
  }
}

// Finance Admin closes and locks Annual Budget: every Approved Original
// Budget line in the just-finished cycle flows its 12-month total back
// into its linked Medium Term Projection line's matching FY column (the
// FY it was approved for — e.g. a FY27 Original Budget updates MTP's
// FY27 figure) — so the next time Medium Term Projection is rolled
// forward, that FY carries the real, approved Original Budget amount
// instead of whatever planning figure was there before. A line added by
// hand with no `sourceMtpLineId`, or whose linked MTP line no longer
// exists or has already rolled that FY out of its window, is skipped —
// there's nothing on Medium Term Projection left to update.
function flowOriginalBudgetIntoMtp(byUserId: string) {
  const db = getDb();
  const originalYear = currentOriginalBudgetYear();
  if (originalYear === null) return;
  const targetFyKey = fyKey(originalYear);
  const approvedOriginal = db.budgetLines.filter(
    (l) => l.kind === 'OB' && l.submissionYear === originalYear && l.step === 'APPROVED' && l.sourceMtpLineId
  );
  for (const ob of approvedOriginal) {
    const mtp = db.budgetLines.find((l) => l.id === ob.sourceMtpLineId && l.kind === 'MTP');
    if (!mtp || !(targetFyKey in mtp.periods)) continue;
    const total = sumPeriods(ob.periods);
    if (mtp.periods[targetFyKey] === total) continue;
    mtp.periods[targetFyKey] = total;
    mtp.updatedAt = now();
    pushHistory(mtp, byUserId, 'sync', mtp.step, mtp.step, `${targetFyKey} updated to ${total} from the approved Original Budget`);
  }
}

// Finance Admin opens Block Budget: every current Medium Term Projection
// line is mirrored into a Block Budget line covering the 5 FYs starting
// at `blockStartYear` (e.g. 2028 -> FY28-FY32), with its catalog fields
// and those 5 years' actual figures pulled straight from MTP — unlike
// Original Budget, there's no "remove if zero" rule here, every MTP line
// gets (or keeps) a Block Budget counterpart. A Block Budget line already
// linked to a given MTP line (via `sourceMtpLineId`) is rolled forward IN
// PLACE — same record, periods reset to the new window, step back to
// Branch Rep Draft — exactly like MTP's own rollover, rather than
// accumulating a fresh record every cycle the way Annual Budget's RB/OB
// do (Block Budget has no FY-submission concept to tell cycles apart by).
// An MTP line with no existing Block Budget counterpart yet gets a
// brand-new one.
function rollBlockBudgetForward(blockStartYear: number, byUserId: string) {
  const db = getDb();
  const windowKeys = periodKeys('BLOCK', blockStartYear);
  const mtpLines = db.budgetLines.filter((l) => l.kind === 'MTP');
  const existingBlockByMtpId = new Map<string, StoredBudgetLine>();
  for (const l of db.budgetLines) {
    if (l.kind === 'BLOCK' && l.sourceMtpLineId) existingBlockByMtpId.set(l.sourceMtpLineId, l);
  }
  for (const mtp of mtpLines) {
    const newPeriods: Record<string, number> = {};
    for (const key of windowKeys) newPeriods[key] = Number(mtp.periods[key] ?? 0);
    const existing = existingBlockByMtpId.get(mtp.id);
    if (existing) {
      existing.projectId = mtp.projectId;
      existing.description = mtp.description;
      existing.opsOrDev = mtp.opsOrDev;
      existing.account = mtp.account;
      existing.subAcct = mtp.subAcct;
      existing.fundingEntryId = mtp.fundingEntryId;
      existing.recurring = mtp.recurring;
      existing.costCentre = mtp.costCentre;
      existing.itProject = mtp.itProject;
      existing.ictExp = mtp.ictExp;
      existing.buildOrBuy = mtp.buildOrBuy;
      existing.basis = mtp.basis;
      existing.periods = newPeriods;
      existing.previousPeriods = { ...newPeriods };
      existing.justifications = {};
      const from = existing.step;
      existing.step = 'DRAFT';
      existing.updatedAt = now();
      pushHistory(existing, byUserId, 'rollover', from, 'DRAFT', `Rolled forward to the ${windowKeys[0]}-${windowKeys[windowKeys.length - 1]} Block Budget window`);
    } else {
      const line: StoredBudgetLine = {
        id: nextId('line'),
        projectId: mtp.projectId,
        kind: 'BLOCK',
        step: 'DRAFT',
        description: mtp.description,
        opsOrDev: mtp.opsOrDev,
        account: mtp.account,
        subAcct: mtp.subAcct,
        fundingEntryId: mtp.fundingEntryId,
        recurring: mtp.recurring,
        costCentre: mtp.costCentre,
        itProject: mtp.itProject,
        ictExp: mtp.ictExp,
        buildOrBuy: mtp.buildOrBuy,
        basis: mtp.basis,
        budgetType: null,
        periods: newPeriods,
        previousPeriods: { ...newPeriods },
        justifications: {},
        justificationForVariance: '',
        submissionYear: null,
        sourceMtpLineId: mtp.id,
        assignedToUserId: mtp.assignedToUserId,
        reviewer1UserId: null,
        reviewer2UserId: null,
        approverUserId: null,
        financeOfficerUserId: null,
        history: [],
        createdAt: now(),
        updatedAt: now(),
      };
      db.budgetLines.push(line);
      pushHistory(line, byUserId, 'rollover', 'DRAFT', 'DRAFT', 'Added from Medium Term Projection');
    }
  }
}

async function run<T>(fn: () => T): Promise<T> {
  try {
    const result = fn();
    return result === undefined ? result : (JSON.parse(JSON.stringify(result)) as T);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export const api = {
  users: {
    list: () => run(() => getDb().users),
    create: (data: { name: string; email: string; groups: Group[]; status?: 'Active' | 'Inactive' }) =>
      run(() => {
        const user = requireUser();
        if (!isSuperAdmin(user)) throw new Error('Only Super Admin can add a user');
        if (!data.name.trim()) throw new Error('Name is required');
        if (!data.email.trim()) throw new Error('Email is required');
        if (data.groups.length === 0) throw new Error('Select at least one group');
        const newUser: User = {
          id: nextId('user'),
          name: data.name.trim(),
          email: data.email.trim(),
          groups: data.groups,
          status: data.status ?? 'Active',
          createdAt: now(),
        };
        getDb().users.push(newUser);
        saveDb();
        return newUser;
      }),
    update: (id: string, data: Partial<Pick<User, 'name' | 'email' | 'groups' | 'status'>>) =>
      run(() => {
        const actor = requireUser();
        if (!isSuperAdmin(actor)) throw new Error('Only Super Admin can edit a user');
        const db = getDb();
        const user = db.users.find((u) => u.id === id);
        if (!user) throw new Error('Not found');
        if ('name' in data && data.name) user.name = data.name;
        if ('email' in data && data.email) user.email = data.email;
        if ('groups' in data && data.groups) {
          if (data.groups.length === 0) throw new Error('Select at least one group');
          user.groups = data.groups;
        }
        if ('status' in data && data.status) user.status = data.status;
        saveDb();
        return user;
      }),
  },

  fundingCatalog: {
    list: () => run(() => getDb().fundingSources),
    create: (data: Pick<FundingSource, 'name' | 'maturity' | 'category'>) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add a Source of Funding');
        if (!data.name.trim()) throw new Error('Source of Fund name is required');
        const source: FundingSource = {
          id: nextId('fundsrc'),
          name: data.name.trim(),
          maturity: data.maturity,
          category: data.category,
          status: 'Active',
          createdAt: now(),
        };
        getDb().fundingSources.push(source);
        saveDb();
        return source;
      }),
    setStatus: (id: string, status: FundingSource['status']) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can change a Source of Funding');
        const db = getDb();
        const source = db.fundingSources.find((f) => f.id === id);
        if (!source) throw new Error('Not found');
        source.status = status;
        saveDb();
        return source;
      }),
  },

  accountCodes: {
    list: () => run(() => getDb().accountCodes),
    create: (data: { code: string; description: string; level: AccountLevel; opsOrDev: AccountCode['opsOrDev'] }) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add an Account');
        if (!data.code.trim() || !data.description.trim()) throw new Error('Account code and description are required');
        const account: AccountCode = {
          id: nextId('acct'),
          code: data.code.trim(),
          description: data.description.trim(),
          level: data.level,
          opsOrDev: data.opsOrDev,
          status: 'Active',
          createdAt: now(),
        };
        getDb().accountCodes.push(account);
        saveDb();
        return account;
      }),
    update: (id: string, data: Partial<Pick<AccountCode, 'opsOrDev' | 'status'>>) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can change an Account');
        const account = getDb().accountCodes.find((a) => a.id === id);
        if (!account) throw new Error('Not found');
        if ('opsOrDev' in data && data.opsOrDev) account.opsOrDev = data.opsOrDev;
        if ('status' in data && data.status) account.status = data.status;
        saveDb();
        return account;
      }),
  },

  costCentres: {
    list: () => run(() => getDb().costCentres),
    create: (data: {
      code: string;
      name: string;
      type: CostCentreType;
      natureOfExpenditure: ExpenditureNature;
      financeOfficerUserId: string | null;
    }) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add a Cost Centre');
        if (!data.code.trim() || !data.name.trim()) throw new Error('Cost Centre code and name are required');
        const costCentre: CostCentreCode = {
          id: nextId('cc'),
          code: data.code.trim(),
          name: data.name.trim(),
          type: data.type,
          natureOfExpenditure: data.natureOfExpenditure,
          financeOfficerUserId: data.financeOfficerUserId,
          createdAt: now(),
        };
        getDb().costCentres.push(costCentre);
        saveDb();
        return costCentre;
      }),
    update: (id: string, data: Partial<Pick<CostCentreCode, 'type' | 'natureOfExpenditure' | 'financeOfficerUserId'>>) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can change a Cost Centre');
        const cc = getDb().costCentres.find((c) => c.id === id);
        if (!cc) throw new Error('Not found');
        if ('type' in data && data.type) cc.type = data.type;
        if ('natureOfExpenditure' in data && data.natureOfExpenditure) cc.natureOfExpenditure = data.natureOfExpenditure;
        if ('financeOfficerUserId' in data) cc.financeOfficerUserId = data.financeOfficerUserId ?? null;
        saveDb();
        return cc;
      }),
  },

  // Populates a budget line's ICT Expenditure Category dropdown (shown
  // only when "Is it an IT Project?" is Yes). Just a named list — Finance
  // Admin can only add, never rename/remove.
  ictExpenditureCategories: {
    list: () => run(() => getDb().ictExpenditureCategories),
    create: (name: string) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add an ICT Expenditure Category');
        if (!name.trim()) throw new Error('Name is required');
        const category: IctExpenditureCategory = { id: nextId('ictcat'), name: name.trim(), createdAt: now() };
        getDb().ictExpenditureCategories.push(category);
        saveDb();
        return category;
      }),
  },

  // A plain named list of divisions — nothing else in the app references
  // it yet.
  divisions: {
    list: () => run(() => getDb().divisions),
    create: (name: string) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add a Division');
        if (!name.trim()) throw new Error('Name is required');
        const division: Division = { id: nextId('division'), name: name.trim(), createdAt: now() };
        getDb().divisions.push(division);
        saveDb();
        return division;
      }),
  },

  // Each Project Profile is assigned a unique Sub Account (see
  // projects.update's subAccount field), which then auto-populates a new
  // budget line's own Sub Account (see budgetLines.create/createAdHoc).
  subAccounts: {
    list: () => run(() => getDb().subAccounts),
    create: (data: { code: string; name: string }) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add a Sub Account');
        if (!data.code.trim() || !data.name.trim()) throw new Error('Sub Account code and name are required');
        const subAccount: SubAccountCode = {
          id: nextId('subacct'),
          code: data.code.trim(),
          name: data.name.trim(),
          status: 'Active',
          createdAt: now(),
        };
        getDb().subAccounts.push(subAccount);
        saveDb();
        return subAccount;
      }),
    setStatus: (id: string, status: SubAccountCode['status']) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can change a Sub Account');
        const subAccount = getDb().subAccounts.find((s) => s.id === id);
        if (!subAccount) throw new Error('Not found');
        subAccount.status = status;
        saveDb();
        return subAccount;
      }),
  },

  // Non IT Item / IT Item percentages — drives both recurring-line
  // auto-growth and the MTP Variance justification threshold. Finance
  // Admin can only change the two existing rows' values, not add/remove.
  inflationRates: {
    list: () => run(() => getDb().inflationRates),
    update: (id: string, value: number) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can change the Inflation Rate');
        if (!Number.isFinite(value) || value < 0) throw new Error('Value must be a non-negative percentage');
        const rate = getDb().inflationRates.find((r) => r.id === id);
        if (!rate) throw new Error('Not found');
        rate.value = value;
        rate.updatedAt = now();
        saveDb();
        return rate;
      }),
  },

  // The Fin Supported duplicate created when a line reaches APPROVED (see
  // budgetLines.approve) — editable only by Finance Officer/Finance
  // Manager, and editing it never touches the original BudgetLine.
  finSupportedLines: {
    // Mainstreaming is computed live, grouped per project, never stored —
    // only once that project's MTP budget period is Closed for Submission
    // or Closed and Locked (see lib/mainstreaming.ts).
    list: () =>
      run(() => {
        const db = getDb();
        const mtpPeriod = getBudgetPeriod('MTP');
        const mtpStatus = effectiveBudgetPeriodStatus(mtpPeriod, currentSimDate);
        const mainstreamingEligible = mtpStatus === 'Closed for Submission' || mtpStatus === 'Closed and Locked';
        const byProject = new Map<string, FinSupportedLine[]>();
        for (const l of db.finSupportedLines) {
          if (!l.projectId) continue;
          const arr = byProject.get(l.projectId) ?? [];
          arr.push(l);
          byProject.set(l.projectId, arr);
        }
        const mainstreamingByLineId = new Map<string, Record<string, number>>();
        if (mainstreamingEligible) {
          for (const [projectId, group] of byProject) {
            const mtpGroup = group.filter((l) => l.kind === 'MTP');
            if (mtpGroup.length === 0) continue;
            const entries = db.fundingEntries.filter((f) => f.projectId === projectId);
            const externalEntries = entries.filter((e) => {
              const source = db.fundingSources.find((s) => s.id === e.fundingSourceId);
              return source?.category === 'External' && source.maturity === 'Approved';
            });
            const totalSupportedFund = externalEntries.reduce((sum, e) => sum + (Number(e.supportedFund) || 0), 0);
            const expiries = externalEntries.map((e) => e.fundExpiryDate).filter((d): d is string => !!d).map((d) => fyOfDate(d));
            const expiryFY = expiries.length > 0 ? Math.min(...expiries) : null;
            if (totalSupportedFund <= 0 && expiryFY === null) continue;
            const computed = computeMainstreaming(mtpGroup, totalSupportedFund, expiryFY);
            for (const [lineId, periods] of computed) mainstreamingByLineId.set(lineId, periods);
          }
        }
        return db.finSupportedLines.map((l) => ({ ...l, mainstreamingPeriods: mainstreamingByLineId.get(l.id) ?? null }));
      }),
    update: (id: string, periods: Record<string, number>) =>
      run(() => {
        const user = requireUser();
        if (!canEditFinSupported(user)) throw new Error('Only Finance Officer or Finance Manager can edit a Fin Supported line');
        const line = getDb().finSupportedLines.find((f) => f.id === id);
        if (!line) throw new Error('Not found');
        line.periods = { ...line.periods, ...periods };
        line.updatedAt = now();
        saveDb();
        return line;
      }),
  },

  projects: {
    // Branch Rep (and every other non-Finance group) only sees a project
    // they opened or are a team member of; Finance (Officer, Manager, or
    // Admin) sees every project, same visibility rule as a budget line.
    list: () =>
      run(() => {
        const user = requireUser();
        const teamMembers = teamMembersByProject();
        return getDb().projects.filter((p) => canSeeProject(p, user, teamMembers.get(p.id) ?? []));
      }),
    get: (id: string) => run(() => getProjectOrThrow(id)),
    create: (data: { title: string; justification: string; additionalComments?: string }) =>
      run(() => {
        const user = requireUser();
        if (!canCreateProject(user)) throw new Error('Only a Branch Rep can create a project');
        if (!data.title || !data.justification) {
          throw new Error('Project Title and Justification of Expenditure are required');
        }
        const project: Project = {
          id: nextId('project'),
          title: data.title,
          status: 'Draft',
          justification: data.justification,
          additionalComments: data.additionalComments ?? '',
          subAccount: '',
          developmentCostCentre: '',
          operatingCostCentre: '',
          financeOfficerId: null,
          openedByUserId: user.id,
          createdAt: now(),
          updatedAt: now(),
        };
        getDb().projects.push(project);
        saveDb();
        return project;
      }),
    update: (id: string, data: Partial<Project>) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(id);
        const finance = isFinance(user);

        // Pending (awaiting Finance approval) still lets the owning Branch
        // Rep keep editing the request — Finance approval happens whenever
        // they get to it, not the moment it's submitted.
        if (isOwningBranchRep(user, project) && (project.status === 'Draft' || project.status === 'Rejected' || project.status === 'Pending')) {
          if ('title' in data) project.title = data.title!;
          if ('justification' in data) project.justification = data.justification!;
          if ('additionalComments' in data) project.additionalComments = data.additionalComments!;
        }
        if (finance && project.status === 'Pending') {
          if ('subAccount' in data) project.subAccount = data.subAccount!;
          if ('developmentCostCentre' in data) project.developmentCostCentre = data.developmentCostCentre!;
          if ('operatingCostCentre' in data) project.operatingCostCentre = data.operatingCostCentre!;
          if ('financeOfficerId' in data) project.financeOfficerId = data.financeOfficerId!;
        }
        project.updatedAt = now();
        saveDb();
        return project;
      }),
    submitRequest: (id: string) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(id);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can submit this request');
        if (project.status !== 'Draft' && project.status !== 'Rejected') {
          throw new Error('Project is not in Draft status');
        }
        if (!project.title || !project.justification) {
          throw new Error('Project Title and Justification of Expenditure are required');
        }
        project.status = 'Pending';
        project.updatedAt = now();
        saveDb();
        return project;
      }),
    approve: (id: string) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(id);
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can approve project creation');
        if (project.status !== 'Pending') throw new Error('Project is not awaiting Finance approval');
        if (!project.subAccount || !project.developmentCostCentre || !project.operatingCostCentre || !project.financeOfficerId) {
          throw new Error('Sub Account, Development Cost Centre, Operating Cost Centre and Finance Officer must be filled before approving');
        }
        project.status = 'Active';
        project.updatedAt = now();
        saveDb();
        return project;
      }),
    reject: (id: string) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(id);
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can reject project creation');
        if (project.status !== 'Pending') throw new Error('Project is not awaiting Finance approval');
        project.status = 'Rejected';
        project.updatedAt = now();
        saveDb();
        return project;
      }),
  },

  // Project-level Source of Funding: picking a catalog entry, and (for
  // Finance) promoting it to the matching Approved catalog entry.
  funding: {
    list: (projectId: string) => run(() => getDb().fundingEntries.filter((f) => f.projectId === projectId)),
    // Every funding entry across every project — used by Medium Term
    // Projection > Budget Line Item, which spans multiple projects at once.
    listAll: () => run(() => getDb().fundingEntries),
    create: (projectId: string, fundingSourceId: string) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can add a funding source');
        const source = getFundingSourceOrThrow(fundingSourceId);
        if (source.status !== 'Active') throw new Error('That Source of Funding is not active');
        if (source.maturity !== 'Pipeline') throw new Error('Branch Rep can only select a Pipeline Source of Funding');
        const entry: FundingEntry = {
          id: nextId('funding'),
          projectId: project.id,
          fundingSourceId,
          fundingPotId: '',
          supportedFund: 0,
          fundStartDate: null,
          fundExpiryDate: null,
          developmentCostCentre: '',
          operatingCostCentre: '',
          createdAt: now(),
          updatedAt: now(),
        };
        getDb().fundingEntries.push(entry);
        saveDb();
        return entry;
      }),
    // The pot details (Pot ID, Supported Fund amount, Start/Expiry Date,
    // Development/Operating Cost Centre) only make sense once the entry is
    // on an External source — Finance fills these in (not the Branch Rep)
    // since they drive the Mainstreaming computation.
    updatePotDetails: (
      id: string,
      data: Partial<Pick<FundingEntry, 'fundingPotId' | 'supportedFund' | 'fundStartDate' | 'fundExpiryDate' | 'developmentCostCentre' | 'operatingCostCentre'>>
    ) =>
      run(() => {
        const user = requireUser();
        if (!isFinanceOrFinanceAdmin(user)) throw new Error('Only Finance can edit funding pot details');
        const entry = getDb().fundingEntries.find((f) => f.id === id);
        if (!entry) throw new Error('Not found');
        if ('fundingPotId' in data && data.fundingPotId !== undefined) entry.fundingPotId = data.fundingPotId;
        if ('supportedFund' in data && data.supportedFund !== undefined) {
          if (!Number.isFinite(data.supportedFund) || data.supportedFund < 0) throw new Error('Supported Fund must be a non-negative amount');
          entry.supportedFund = data.supportedFund;
        }
        if ('fundStartDate' in data) entry.fundStartDate = data.fundStartDate ?? null;
        if ('fundExpiryDate' in data) entry.fundExpiryDate = data.fundExpiryDate ?? null;
        if ('developmentCostCentre' in data && data.developmentCostCentre !== undefined) entry.developmentCostCentre = data.developmentCostCentre;
        if ('operatingCostCentre' in data && data.operatingCostCentre !== undefined) entry.operatingCostCentre = data.operatingCostCentre;
        entry.updatedAt = now();
        saveDb();
        return entry;
      }),
    update: (id: string, fundingSourceId: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const entry = db.fundingEntries.find((f) => f.id === id);
        if (!entry) throw new Error('Not found');
        const project = getProjectOrThrow(entry.projectId);
        const currentSource = getFundingSourceOrThrow(entry.fundingSourceId);
        const nextSource = getFundingSourceOrThrow(fundingSourceId);
        if (nextSource.status !== 'Active') throw new Error('That Source of Funding is not active');

        const isFinanceActor = isFinanceOrFinanceAdmin(user);
        if (isFinanceActor) {
          if (nextSource.maturity !== 'Approved') {
            throw new Error('Finance can only change this to an Approved Source of Funding');
          }
          // Approving an External entry promotes it straight into a real
          // funding pot (see Project Funding Pot) — the pot details have
          // to exist first, same as the rest of the entry, not be left for
          // "later". An Internal entry has no pot-details concept at all
          // (see PotDetailsPanel's own isExternal gate), so this never
          // applies to one.
          if (nextSource.category === 'External') {
            const missing: string[] = [];
            if (!entry.fundingPotId.trim()) missing.push('Funding Pot ID');
            if (!entry.fundStartDate) missing.push('Fund Start Date');
            if (!entry.fundExpiryDate) missing.push('Fund Expiry Date');
            if (!entry.developmentCostCentre) missing.push('Project Development Cost Centre');
            if (!entry.operatingCostCentre) missing.push('Project Operating Cost Centre');
            if (missing.length > 0) {
              throw new Error(`Fill in ${missing.join(', ')} before approving this Source of Funding.`);
            }
          }
        } else if (isOwningBranchRep(user, project)) {
          if (currentSource.maturity !== 'Pipeline') {
            throw new Error('This entry has already been approved and can no longer be changed by the Branch Rep');
          }
          if (nextSource.maturity !== 'Pipeline') {
            throw new Error('Branch Rep can only select a Pipeline Source of Funding');
          }
        } else {
          throw new Error('You do not have permission to edit this entry');
        }

        entry.fundingSourceId = fundingSourceId;
        entry.updatedAt = now();
        saveDb();
        return entry;
      }),
    remove: (id: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const entry = db.fundingEntries.find((f) => f.id === id);
        if (!entry) throw new Error('Not found');
        const project = getProjectOrThrow(entry.projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can remove this entry');
        const source = getFundingSourceOrThrow(entry.fundingSourceId);
        if (source.maturity !== 'Pipeline') throw new Error('Only Pipeline entries can be removed');
        db.fundingEntries = db.fundingEntries.filter((f) => f.id !== id);
        saveDb();
      }),
  },

  budgetLines: {
    // Visibility, not just editability: a line is only returned if the
    // acting user is tagged on it or is a team member of the project.
    // Finance (Officer/Manager/Admin) sees every line regardless.
    list: (projectId: string, kind: BudgetKind) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const teamMemberUserIds = db.teamMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
        return db.budgetLines
          .filter((l) => l.projectId === projectId && l.kind === kind)
          .filter((l) => canSeeLine(l, user, teamMemberUserIds))
          .map(withComputed);
      }),
    // Every line of a kind for one project, regardless of per-line
    // tagging — used for project-level financial aggregates (the AOR
    // ledger) rather than a personal work queue, so it's gated only by
    // whether the acting user can see the project at all (same rule as
    // Project Profile), not by whether they're tagged on each line.
    listAllForProject: (projectId: string, kind: BudgetKind) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(projectId);
        const teamMembers = teamMembersByProject();
        if (!canSeeProject(project, user, teamMembers.get(projectId) ?? [])) return [];
        return getDb()
          .budgetLines.filter((l) => l.projectId === projectId && l.kind === kind)
          .map(withComputed);
      }),
    // Cross-project view for Medium Term Projection > Budget Line Item: every
    // MTP-kind line the acting user can see, whether it belongs to a Project
    // Profile or is a standalone ad hoc line (projectId === null).
    listAllMtp: () => run(() => listByKindsImpl(['MTP'])),
    // Generic version of listAllMtp for Annual Budget's Revised/Original
    // Budget Line Item pages, which span two kinds (RB and OB) at once.
    listByKinds: (kinds: BudgetKind[]) => run(() => listByKindsImpl(kinds)),
    // Block Budget Line Item: every BLOCK-kind line the acting user can
    // see, each with its Revised/Original Budget reference totals
    // (read-only context columns — see BlockBudgetLineWithReferences)
    // looked up via the shared `sourceMtpLineId` and the Block Budget
    // Start Year's -2/-1 reference FYs.
    listBlockBudget: () =>
      run(() => {
        const lines = listByKindsImpl(['BLOCK']);
        const db = getDb();
        const blockPeriod = getBudgetPeriod('BLOCK');
        const revisedYear = blockPeriod.blockBudgetStartYear !== null ? blockPeriod.blockBudgetStartYear - 2 : null;
        const originalYear = blockPeriod.blockBudgetStartYear !== null ? blockPeriod.blockBudgetStartYear - 1 : null;
        return lines.map((line) => {
          const revised =
            revisedYear !== null && line.sourceMtpLineId
              ? db.budgetLines.find((l) => l.kind === 'RB' && l.sourceMtpLineId === line.sourceMtpLineId && l.submissionYear === revisedYear)
              : undefined;
          const original =
            originalYear !== null && line.sourceMtpLineId
              ? db.budgetLines.find((l) => l.kind === 'OB' && l.sourceMtpLineId === line.sourceMtpLineId && l.submissionYear === originalYear)
              : undefined;
          return {
            ...line,
            revisedBudgetTotal: revised ? sumPeriods(revised.periods) : null,
            originalBudgetTotal: original ? sumPeriods(original.periods) : null,
          };
        });
      }),
    // Action-queue view for Review Phase / Approval Phase: every line of
    // these kinds the acting user can act on *right now*, regardless of
    // tagging or team membership — needed because a CIO-group user (a
    // group-based actor, not a tagged one) must see a line the moment it
    // reaches Pending Approval (CIO), even if they were never tagged or
    // added as a team member.
    listActionQueue: (kinds: BudgetKind[]) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        return db.budgetLines
          .filter((l) => kinds.includes(l.kind))
          .filter(belongsToCurrentCycle)
          .filter((l) => userCanAct(l, user, owningProjectOf(l)))
          .map(withComputed);
      }),
    create: (projectId: string, kind: BudgetKind, simulationYear: number) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can add a budget line');
        requireBudgetPeriodEditable(kind, user);
        const line: StoredBudgetLine = {
          id: nextId('line'),
          projectId: project.id,
          kind,
          step: 'DRAFT',
          description: '',
          opsOrDev: '',
          account: '',
          // Auto-populated from the project's own Sub Account (Finance
          // fills that in on Details) — Branch Rep can still edit it.
          subAcct: project.subAccount,
          fundingEntryId: null,
          recurring: '',
          costCentre: '',
          itProject: '',
          ictExp: '',
          buildOrBuy: '',
          basis: '',
          budgetType: kind === 'RB' || kind === 'OB' ? kind : null,
          periods: emptyPeriods(kind, simulationYear),
          previousPeriods: emptyPeriods(kind, simulationYear),
          justifications: {},
          justificationForVariance: '',
          submissionYear: submissionYearFor(kind),
          sourceMtpLineId: null,
          assignedToUserId: user.id,
          reviewer1UserId: null,
          reviewer2UserId: null,
          approverUserId: null,
          financeOfficerUserId: null,
          history: [],
          createdAt: now(),
          updatedAt: now(),
        };
        getDb().budgetLines.push(line);
        saveDb();
        return withComputed(line);
      }),
    // Adds a Budget Line Item from Medium Term Projection (or an Annual
    // Budget Revised/Original Budget Line Item page), independent of any
    // project tab. `projectId` is null for an ad hoc line (no Project
    // Profile; owned by the acting user) or the id of a project the acting
    // user is a team member of (or owning Branch Rep of) — in that case the
    // line is owned by that project's Branch Rep, exactly as if it had been
    // added from that project's own tab, so it shows up there too.
    createAdHoc: (kind: BudgetKind, simulationYear: number, projectId: string | null) =>
      run(() => {
        const user = requireUser();
        requireBudgetPeriodEditable(kind, user);
        const db = getDb();
        let assignedToUserId = user.id;
        if (projectId !== null) {
          const project = getProjectOrThrow(projectId);
          const teamMemberUserIds = db.teamMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
          const allowed = isOwningBranchRep(user, project) || teamMemberUserIds.includes(user.id);
          if (!allowed) throw new Error('You must be the owning Branch Rep or a team member of that project');
          assignedToUserId = project.openedByUserId;
        } else if (!canCreateProject(user)) {
          throw new Error('Only a Branch Rep can add a Budget Line Item');
        }
        const line: StoredBudgetLine = {
          id: nextId('line'),
          projectId,
          kind,
          step: 'DRAFT',
          description: '',
          opsOrDev: '',
          account: '',
          subAcct: '',
          fundingEntryId: null,
          recurring: '',
          costCentre: '',
          itProject: '',
          ictExp: '',
          buildOrBuy: '',
          basis: '',
          budgetType: kind === 'RB' || kind === 'OB' ? kind : null,
          // A brand-new line has no prior submission to compare against —
          // last FY's amount is taken as 0, so any figure the Branch Rep
          // enters is an unconditional variance (see lib/variance.ts).
          periods: emptyPeriods(kind, simulationYear),
          previousPeriods: emptyPeriods(kind, simulationYear),
          justifications: {},
          justificationForVariance: '',
          submissionYear: submissionYearFor(kind),
          sourceMtpLineId: null,
          assignedToUserId,
          reviewer1UserId: null,
          reviewer2UserId: null,
          approverUserId: null,
          financeOfficerUserId: null,
          history: [],
          createdAt: now(),
          updatedAt: now(),
        };
        db.budgetLines.push(line);
        saveDb();
        return withComputed(line);
      }),
    // Attaches (or detaches, with projectId = null) an ad hoc Budget Line
    // Item to a Project Profile. Once attached it shows up in that project's
    // own tab too, since it's the same underlying record.
    setProject: (id: string, projectId: string | null) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        if (line.kind === 'BLOCK') throw new Error('Block Budget lines cannot be attached to a project here');
        const currentProject = owningProjectOf(line);
        if (!isOwningBranchRep(user, currentProject)) throw new Error("Only the line's owning Branch Rep can change its Project Title");
        requireBudgetPeriodEditable(line.kind, user);
        if (projectId === null) {
          line.projectId = null;
        } else {
          const project = getProjectOrThrow(projectId);
          const teamMemberUserIds = db.teamMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
          if (!isOwningBranchRep(user, project) && !teamMemberUserIds.includes(user.id)) {
            throw new Error('You must be a team member of that project to attach this line to it');
          }
          line.projectId = projectId;
        }
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    update: (id: string, data: Partial<BudgetLine>, simulationYear: number) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = owningProjectOf(line);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can edit this line');
        if (!isEditableByBranchRep(line.step)) throw new Error('This line is not currently editable');
        requireBudgetPeriodEditable(line.kind, user);

        const EDITABLE_FIELDS = [
          'description',
          'opsOrDev',
          'account',
          'subAcct',
          'fundingEntryId',
          'recurring',
          'costCentre',
          'itProject',
          'ictExp',
          'buildOrBuy',
          'basis',
          'reviewer1UserId',
          'approverUserId',
          'financeOfficerUserId',
        ] as const;
        for (const field of EDITABLE_FIELDS) {
          if (field in data) (line as any)[field] = (data as any)[field];
        }
        if ('reviewer2UserId' in data) {
          if (data.reviewer2UserId && data.reviewer2UserId === line.reviewer1UserId) {
            throw new Error('Reviewer 2 must be a different person from Reviewer 1');
          }
          line.reviewer2UserId = data.reviewer2UserId ?? null;
        }
        if (!line.itProject || line.itProject !== 'Yes') {
          line.ictExp = '';
          line.buildOrBuy = '';
        }
        if ('justifications' in data && data.justifications) {
          line.justifications = { ...line.justifications, ...data.justifications };
        }
        if ('justificationForVariance' in data && data.justificationForVariance !== undefined) {
          line.justificationForVariance = data.justificationForVariance;
        }

        const rates = getInflationRates();
        const keys = periodKeys(line.kind, simulationYear);

        // Once Medium Term Projection has been opened for a cycle, the
        // window's first FY column is locked for edits — its real figure
        // comes from that FY's Original Budget once Annual Budget
        // approves and locks it in (see flowOriginalBudgetIntoMtp), not
        // from direct editing here. Snapshot it before any of the
        // branches below touch `line.periods`, then clamp it back
        // afterward regardless of which branch ran.
        const mtpFirstKeyLocked = line.kind === 'MTP' && getBudgetPeriod('MTP').status !== 'Draft';
        const lockedFirstKey = mtpFirstKeyLocked ? Object.keys(line.periods)[0] : null;
        const lockedFirstKeyValue = lockedFirstKey !== null ? line.periods[lockedFirstKey] : undefined;

        if ('periods' in data) {
          const incoming = data.periods as Record<string, number>;
          if (line.recurring === 'Yes') {
            const baseAmount = Number(incoming[keys[0]] ?? line.periods[keys[0]] ?? 0);
            line.periods = applyRecurringInflation(line.kind, simulationYear, line.recurring, line.itProject, baseAmount, rates);
          } else {
            line.periods = { ...emptyPeriods(line.kind, simulationYear), ...line.periods, ...incoming };
          }
        } else if ('recurring' in data || 'itProject' in data) {
          if (line.recurring === 'Yes') {
            const baseAmount = Number(line.periods[keys[0]] ?? 0);
            line.periods = applyRecurringInflation(line.kind, simulationYear, line.recurring, line.itProject, baseAmount, rates);
          }
        }

        if (lockedFirstKey !== null) {
          line.periods[lockedFirstKey] = lockedFirstKeyValue!;
        }

        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    // Reassign the Branch Rep (ad hoc lines only — a project-attached
    // line's Branch Rep always follows the Project Profile's own opener,
    // so reassigning it here would have no effect), Reviewer 1, Reviewer
    // 2, or Approver on a line — available to anyone who can currently
    // see it (tagged on it, a team member, or Finance), not just its
    // current Branch Rep, and regardless of workflow step. Whoever is
    // reassigned away from naturally stops seeing the line afterward
    // (see canSeeLine) — that's just a consequence of the field change,
    // not a separate step.
    reassign: (
      id: string,
      data: Partial<Pick<BudgetLine, 'assignedToUserId' | 'reviewer1UserId' | 'reviewer2UserId' | 'approverUserId'>>
    ) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const teamMemberUserIds = line.projectId ? db.teamMembers.filter((m) => m.projectId === line.projectId).map((m) => m.userId) : [];
        if (!canSeeLine(line, user, teamMemberUserIds)) throw new Error('You do not have access to this line');
        if ('assignedToUserId' in data && data.assignedToUserId && line.projectId === null) {
          if (!db.users.some((u) => u.id === data.assignedToUserId)) throw new Error('Unknown user');
          line.assignedToUserId = data.assignedToUserId;
        }
        if ('reviewer1UserId' in data) line.reviewer1UserId = data.reviewer1UserId ?? null;
        if ('reviewer2UserId' in data) {
          if (data.reviewer2UserId && data.reviewer2UserId === line.reviewer1UserId) {
            throw new Error('Reviewer 2 must be a different person from Reviewer 1');
          }
          line.reviewer2UserId = data.reviewer2UserId ?? null;
        }
        if ('approverUserId' in data) line.approverUserId = data.approverUserId ?? null;
        // Reviewer 2 is optional — if a line is sitting at Pending Approval
        // (Reviewer 2) and reviewer2UserId was just cleared, there's no one
        // left to act on that step, so skip it immediately (same branching
        // nextOnApprove already does when Clarification (FM) first reaches
        // this point with no Reviewer 2 at all).
        if (line.step === 'PENDING_APPROVAL_REVIEWER2' && !line.reviewer2UserId) {
          const from = line.step;
          line.step = nextOnApprove(line.step, line.itProject, line.reviewer2UserId);
          pushHistory(line, user.id, 'reassign', from, line.step, 'Reviewer 2 removed — step skipped');
        }
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    remove: (id: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = owningProjectOf(line);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can delete this line');
        // Only a line that's never been submitted (no history yet — see
        // statusFor's 'New' vs 'Draft' split) can be deleted. One that's
        // already been through the workflow and returned to Draft (a
        // reject or a Return) has reviewer/approver history attached to
        // it and can only be edited from here, not removed outright.
        if (line.history.length > 0) throw new Error('Only a line still marked New (never submitted) can be deleted');
        requireBudgetPeriodEditable(line.kind, user);
        db.budgetLines = db.budgetLines.filter((l) => l.id !== id);
        saveDb();
      }),
    // Branch Rep moves the line forward: Draft -> Review (first
    // submission) or Clarification (Branch Rep) -> Clarification (Finance
    // Officer) (after clarifying a Finance Officer reject).
    submit: (id: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = owningProjectOf(line);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can submit this line');
        if (!canSubmit(line.step)) throw new Error('This line cannot be submitted from its current status');
        requireBudgetPeriodEditable(line.kind, user);
        if (!line.reviewer1UserId || !line.approverUserId) {
          throw new Error('Reviewer 1 and Approver must be selected before submitting');
        }
        if (line.kind === 'MTP' && !justificationSatisfied(line, getInflationRates())) {
          throw new Error('This line has a variance requiring an MTP Variance justification before it can be submitted');
        }
        if (line.kind === 'RB' && !annualJustificationSatisfied(line)) {
          throw new Error('This line has a variance requiring a Justification for Variance before it can be submitted');
        }
        if (line.kind === 'BLOCK' && !blockJustificationSatisfied(line, getInflationRates())) {
          throw new Error('This line has a variance requiring a Block Budget Variance justification before it can be submitted');
        }
        const from = line.step;
        line.step = nextOnSubmit(line.step);
        pushHistory(line, user.id, 'submit', from, line.step);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    // The current actor (Reviewer1/FinOfficer/FinManager/Reviewer2/CIO/
    // Approver) supports the line, moving it to the next step. Reaching
    // APPROVED also duplicates it into Fin Supported with rounded figures.
    approve: (id: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = owningProjectOf(line);
        if (!canApprove(line.step)) throw new Error('This line is not awaiting approval');
        if (!userCanAct(line, user, project)) throw new Error('You are not the assigned actor for this step');
        requireBudgetPeriodEditable(line.kind, user);
        if (STEP_ACTOR[line.step] === 'FinOfficer') {
          line.financeOfficerUserId = user.id;
        }
        const from = line.step;
        line.step = nextOnApprove(line.step, line.itProject, line.reviewer2UserId);
        pushHistory(line, user.id, 'approve', from, line.step);
        line.updatedAt = now();
        if (line.step === 'APPROVED') {
          const roundedPeriods: Record<string, number> = {};
          for (const [key, value] of Object.entries(line.periods)) roundedPeriods[key] = roundToNearestHundred(Number(value) || 0);
          const finSupported: FinSupportedLine = {
            id: nextId('finsupported'),
            sourceBudgetLineId: line.id,
            sourceLineCreatedAt: line.createdAt,
            projectId: line.projectId,
            kind: line.kind,
            description: line.description,
            account: line.account,
            subAcct: line.subAcct,
            opsOrDev: line.opsOrDev,
            costCentre: line.costCentre,
            fundingEntryId: line.fundingEntryId,
            itProject: line.itProject,
            periods: roundedPeriods,
            createdAt: now(),
            updatedAt: now(),
          };
          db.finSupportedLines.push(finSupported);
        }
        saveDb();
        return withComputed(line);
      }),
    // The current actor rejects: Review/Pending Approval bounce back to
    // Branch Rep Draft; a Clarification reject bounces back exactly one
    // step for Branch Rep/Finance Officer to clarify and resubmit.
    reject: (id: string, note?: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = owningProjectOf(line);
        if (!canReject(line.step)) throw new Error('This line cannot be rejected from its current status');
        if (!userCanAct(line, user, project)) throw new Error('You are not the assigned actor for this step');
        requireBudgetPeriodEditable(line.kind, user);
        const from = line.step;
        line.step = nextOnReject(line.step);
        pushHistory(line, user.id, 'reject', from, line.step, note);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
  },

  budgetPeriods: {
    list: () => run(() => getDb().budgetPeriods),
    // Finance Admin opens an exercise: both dates must be set, and no other
    // exercise may currently be active (Open or Locked) — only one of the
    // three can be in flight at a time. Opening Medium Term Projection also
    // rolls every existing MTP line forward into the new 15-year window
    // (see rollMtpLinesForward below).
    open: (type: BudgetExerciseType, startDate: string, endDate: string) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can open a budget period');
        if (!startDate || !endDate) throw new Error('Start Date and End Date are required');
        if (startDate > endDate) throw new Error('Start Date must be before End Date');
        const db = getDb();
        const period = getBudgetPeriod(type);
        if (period.status !== 'Draft') throw new Error(`${EXERCISE_LABEL[type]} is already active`);
        const other = db.budgetPeriods.find((p) => p.type !== type && p.status !== 'Draft');
        if (other) throw new Error(`${EXERCISE_LABEL[other.type]} is currently ${other.status === 'Locked' ? 'Closed and Locked' : 'Open'} — only one budget exercise can be open at a time`);
        if (type === 'BLOCK' && period.blockBudgetStartYear === null) {
          throw new Error('Set a Block Budget Start Year before opening Block Budget');
        }

        if (type === 'MTP') rollMtpLinesForward(fyOfDate(startDate), user.id);
        if (type === 'ANNUAL') rollAnnualBudgetForward(fyOfDate(startDate), user.id);
        if (type === 'BLOCK') rollBlockBudgetForward(period.blockBudgetStartYear!, user.id);

        period.status = 'Open';
        period.startDate = startDate;
        period.endDate = endDate;
        period.updatedAt = now();
        saveDb();
        return period;
      }),
    // End Date can still move while Open and not yet past, per the spec;
    // Start Date is locked the moment the period is opened.
    updateEndDate: (type: BudgetExerciseType, endDate: string) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can change a budget period');
        const period = getBudgetPeriod(type);
        const status = effectiveBudgetPeriodStatus(period, currentSimDate);
        if (status !== 'Open') throw new Error('End Date can only be changed while the period is Open');
        if (!endDate || (period.startDate && endDate < period.startDate)) throw new Error('End Date must be on or after the Start Date');
        period.endDate = endDate;
        period.updatedAt = now();
        saveDb();
        return period;
      }),
    lock: (type: BudgetExerciseType) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can close and lock a budget period');
        const period = getBudgetPeriod(type);
        if (period.status === 'Draft') throw new Error('This budget period has not been opened yet');
        if (type === 'ANNUAL') flowOriginalBudgetIntoMtp(user.id);
        period.status = 'Locked';
        period.updatedAt = now();
        saveDb();
        return period;
      }),
    // Reopens a Closed and Locked period — back to Open, which then reads
    // as Closed for Submission again if the End Date has already passed
    // (i.e. this undoes just the Finance Admin lock, not the submission
    // deadline).
    reopen: (type: BudgetExerciseType) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can reopen a budget period');
        const period = getBudgetPeriod(type);
        if (period.status !== 'Locked') throw new Error('This budget period is not Closed and Locked');
        period.status = 'Open';
        period.updatedAt = now();
        saveDb();
        return period;
      }),
    // Archives a finished (Closed and Locked) cycle back to Draft, clearing
    // its dates, so a different exercise can be opened next — there's no
    // other way to free up the "one active exercise" slot once a cycle is
    // fully done.
    resetToDraft: (type: BudgetExerciseType) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can reset a budget period');
        const period = getBudgetPeriod(type);
        if (period.status !== 'Locked') throw new Error('Only a Closed and Locked budget period can be reset');
        period.status = 'Draft';
        period.startDate = null;
        period.endDate = null;
        if (type === 'BLOCK') period.blockBudgetStartYear = null;
        period.updatedAt = now();
        saveDb();
        return period;
      }),
    // BLOCK only: the calendar year whose FY starts Block Budget's 5-FY
    // window — editable only while still Draft, same as Start Date.
    setBlockBudgetStartYear: (year: number) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can set the Block Budget Start Year');
        const period = getBudgetPeriod('BLOCK');
        if (period.status !== 'Draft') throw new Error('Block Budget Start Year can only be set while Draft');
        if (!Number.isFinite(year)) throw new Error('Block Budget Start Year must be a year');
        period.blockBudgetStartYear = year;
        period.updatedAt = now();
        saveDb();
        return period;
      }),
  },

  teamMembers: {
    list: (projectId: string) => run(() => getDb().teamMembers.filter((m) => m.projectId === projectId)),
    // Every project the given user is a team member of — used by Medium
    // Term Projection > Budget Line Item to populate the Project Title
    // dropdown with "projects they're a team member of".
    listForUser: (userId: string) => run(() => getDb().teamMembers.filter((m) => m.userId === userId)),
    addMany: (projectId: string, userIds: string[]) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const project = getProjectOrThrow(projectId);
        const existing = new Set(db.teamMembers.filter((m) => m.projectId === project.id).map((m) => m.userId));
        if (!isOwningBranchRep(user, project) && !existing.has(user.id)) {
          throw new Error('Only the owning Branch Rep or a current team member can add team members');
        }
        const added: TeamMember[] = [];
        for (const userId of userIds) {
          if (existing.has(userId)) continue;
          if (!db.users.some((u) => u.id === userId)) continue;
          const member: TeamMember = { id: nextId('member'), projectId: project.id, userId, createdAt: now() };
          db.teamMembers.push(member);
          added.push(member);
          existing.add(userId);
        }
        saveDb();
        return added;
      }),
    remove: (id: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const member = db.teamMembers.find((m) => m.id === id);
        if (!member) throw new Error('Not found');
        const project = getProjectOrThrow(member.projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can remove team members');
        db.teamMembers = db.teamMembers.filter((m) => m.id !== id);
        saveDb();
      }),
  },

  // A Project Profile's AOR(s) — Branch Rep (owning, or a team member)
  // keys the details in; Finance Officer/Finance Manager ticks "Finance
  // Confirmed", which locks every field for everyone from then on. More
  // than one AOR can exist per project (e.g. a later top-up); see
  // lib/aor.ts for how its Year/Status and balance are derived.
  aors: {
    list: (projectId: string) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(projectId);
        const teamMembers = teamMembersByProject();
        if (!canSeeProject(project, user, teamMembers.get(project.id) ?? [])) return [];
        return getDb().aors.filter((a) => a.projectId === projectId);
      }),
    // Cross-project Project AOR listing: every *confirmed* AOR the acting
    // user can see (same project-visibility rule as Project Profile) —
    // an unconfirmed one isn't "in the Project AOR" yet, per spec.
    listAllConfirmed: () =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const teamMembers = teamMembersByProject();
        const visibleProjectIds = new Set(
          db.projects.filter((p) => canSeeProject(p, user, teamMembers.get(p.id) ?? [])).map((p) => p.id)
        );
        return db.aors.filter((a) => a.financeConfirmed && visibleProjectIds.has(a.projectId));
      }),
    // Every AOR (confirmed or not) across every project the acting user
    // can see — used for the Original Budget insufficient-balance
    // knock-off check, which counts an AOR's fund the moment it's added,
    // not only once Finance Confirmed.
    listAll: () =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const teamMembers = teamMembersByProject();
        const visibleProjectIds = new Set(
          db.projects.filter((p) => canSeeProject(p, user, teamMembers.get(p.id) ?? [])).map((p) => p.id)
        );
        return db.aors.filter((a) => visibleProjectIds.has(a.projectId));
      }),
    get: (id: string) =>
      run(() => {
        const aor = getDb().aors.find((a) => a.id === id);
        if (!aor) throw new Error('Not found');
        return aor;
      }),
    create: (projectId: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const project = getProjectOrThrow(projectId);
        const teamMemberIds = db.teamMembers.filter((m) => m.projectId === projectId).map((m) => m.userId);
        if (!isOwningBranchRep(user, project) && !teamMemberIds.includes(user.id)) {
          throw new Error('Only the owning Branch Rep or a team member can add an AOR');
        }
        const aor: Aor = {
          id: nextId('aor'),
          projectId,
          approvedByUserId: null,
          approvedDate: null,
          developmentApprovedFund: 0,
          operatingApprovedFund: 0,
          startDate: null,
          expiredDate: null,
          financeConfirmed: false,
          financeConfirmedByUserId: null,
          createdAt: now(),
          updatedAt: now(),
        };
        db.aors.push(aor);
        saveDb();
        return aor;
      }),
    update: (
      id: string,
      data: Partial<Pick<Aor, 'approvedByUserId' | 'approvedDate' | 'developmentApprovedFund' | 'operatingApprovedFund' | 'startDate' | 'expiredDate'>>
    ) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const aor = db.aors.find((a) => a.id === id);
        if (!aor) throw new Error('Not found');
        if (aor.financeConfirmed) throw new Error('This AOR is Finance Confirmed and can no longer be edited');
        const project = getProjectOrThrow(aor.projectId);
        const teamMemberIds = db.teamMembers.filter((m) => m.projectId === aor.projectId).map((m) => m.userId);
        if (!isOwningBranchRep(user, project) && !teamMemberIds.includes(user.id)) {
          throw new Error('Only the owning Branch Rep or a team member can edit this AOR');
        }
        if ('approvedByUserId' in data) aor.approvedByUserId = data.approvedByUserId ?? null;
        if ('approvedDate' in data) aor.approvedDate = data.approvedDate ?? null;
        if ('developmentApprovedFund' in data) aor.developmentApprovedFund = Number(data.developmentApprovedFund) || 0;
        if ('operatingApprovedFund' in data) aor.operatingApprovedFund = Number(data.operatingApprovedFund) || 0;
        if ('startDate' in data) aor.startDate = data.startDate ?? null;
        if ('expiredDate' in data) aor.expiredDate = data.expiredDate ?? null;
        aor.updatedAt = now();
        saveDb();
        return aor;
      }),
    // Finance Officer/Finance Manager (or Super Admin) locks the AOR in —
    // this is also the moment it starts appearing in the cross-project
    // Project AOR listing.
    confirm: (id: string) =>
      run(() => {
        const user = requireUser();
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can confirm an AOR');
        const aor = getDb().aors.find((a) => a.id === id);
        if (!aor) throw new Error('Not found');
        if (aor.financeConfirmed) throw new Error('This AOR is already Finance Confirmed');
        aor.financeConfirmed = true;
        aor.financeConfirmedByUserId = user.id;
        aor.updatedAt = now();
        saveDb();
        return aor;
      }),
  },

  // Finance Officer/Finance Manager only, both read and write — this is
  // sensitive cross-project financial data, not something to leave to a
  // UI-only gate.
  projectFyStatus: {
    list: () =>
      run(() => {
        const user = requireUser();
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can view this');
        return computeExternalProjectFyStatuses(getDb());
      }),
  },

  loanPots: {
    list: () =>
      run(() => {
        const user = requireUser();
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can view this');
        return getDb().loanPots;
      }),
    // Books the loan immediately: creates the LoanPot record and, in the
    // same action, the two Original Budget lines that make it real on
    // both sides (see isFyClosedForOb for where they land). There's no
    // separate "create the lines later" step — by the time this returns,
    // `close` is already allowed.
    create: (data: { loanFromProjectId: string; loanToProjectId: string; loanAmount: number }) =>
      run(() => {
        const user = requireUser();
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can create a loan');
        if (data.loanFromProjectId === data.loanToProjectId) {
          throw new Error('Loan From and Loan To must be different projects');
        }
        if (!Number.isFinite(data.loanAmount) || data.loanAmount <= 0) {
          throw new Error('Loan Amount must be greater than 0');
        }
        const db = getDb();
        const statuses = computeExternalProjectFyStatuses(db);
        const fromStatus = statuses.find((s) => s.project.id === data.loanFromProjectId);
        const toStatus = statuses.find((s) => s.project.id === data.loanToProjectId);
        if (!fromStatus || fromStatus.status !== 'Excess') {
          throw new Error('Loan From must be a project currently showing Excess on Project FY Status (External)');
        }
        if (!toStatus || toStatus.status !== 'Deficit') {
          throw new Error('Loan To must be a project currently showing Deficit on Project FY Status (External)');
        }
        if (data.loanAmount > fromStatus.difference) {
          throw new Error(`Loan Amount cannot exceed the Loan From project's Excess amount (${fromStatus.difference})`);
        }
        const fromProject = getProjectOrThrow(data.loanFromProjectId);
        const toProject = getProjectOrThrow(data.loanToProjectId);

        const loanFy = fromStatus.fy;
        let returnFy = loanFy + 1;
        while (isFyClosedForOb(returnFy)) returnFy += 1;

        function returnLine(project: Project, description: string, amount: number): StoredBudgetLine {
          const periods = flatMonthly(returnFy, amount);
          return {
            id: nextId('line'),
            projectId: project.id,
            kind: 'OB',
            step: 'DRAFT',
            description,
            opsOrDev: '',
            account: '',
            subAcct: project.subAccount,
            fundingEntryId: null,
            recurring: 'No',
            costCentre: '',
            itProject: '',
            ictExp: '',
            buildOrBuy: '',
            basis: `Auto-created by Project Loan Pot (loan of ${data.loanAmount} for FY${String(loanFy % 100).padStart(2, '0')}).`,
            budgetType: 'OB',
            periods,
            previousPeriods: emptyPeriods('OB', returnFy),
            justifications: {},
            justificationForVariance: '',
            submissionYear: returnFy,
            sourceMtpLineId: null,
            assignedToUserId: project.openedByUserId,
            reviewer1UserId: null,
            reviewer2UserId: null,
            approverUserId: null,
            financeOfficerUserId: null,
            history: [],
            createdAt: now(),
            updatedAt: now(),
          };
        }
        // Borrower (loanTo) must budget extra to pay it back; lender
        // (loanFrom) budgets that much less so it doesn't over-budget.
        db.budgetLines.push(returnLine(toProject, 'Return Loan', data.loanAmount));
        db.budgetLines.push(returnLine(fromProject, 'Return from Loan', -data.loanAmount));

        const loan: LoanPot = {
          id: nextId('loan'),
          fy: loanFy,
          status: 'Open',
          loanFromProjectId: data.loanFromProjectId,
          loanToProjectId: data.loanToProjectId,
          loanAmount: data.loanAmount,
          returnLineCreated: true,
          returnFy,
          createdByUserId: user.id,
          createdAt: now(),
          updatedAt: now(),
        };
        db.loanPots.push(loan);
        saveDb();
        return loan;
      }),
    close: (id: string) =>
      run(() => {
        const user = requireUser();
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can close a loan');
        const db = getDb();
        const loan = db.loanPots.find((l) => l.id === id);
        if (!loan) throw new Error('Not found');
        if (loan.status !== 'Open') throw new Error('This loan is not Open');
        if (!loan.returnLineCreated) throw new Error('The return budget line has not been created yet');
        loan.status = 'Closed';
        loan.updatedAt = now();
        saveDb();
        return loan;
      }),
  },
};

// Demo data, triggered on demand by the "Load Sample Data" button (see
// Layout.tsx) — never automatic, since every existing Playwright
// regression test assumes a truly blank slate on a fresh profile. Builds
// two Project Profiles, an AOR, and five Medium Term Projection lines (one
// ad hoc, one in a second project), then drives them through Annual
// Budget (Original Budget bootstrapped straight from MTP) and Block
// Budget (rolled forward from MTP) using the exact same engine functions
// a real Finance Admin/Branch Rep/Reviewer/Approver action would use —
// never hand-crafted records — so every linkage (MTP->OB, MTP->Block,
// approved OB -> AOR knock-off, approved OB -> flow-back into MTP) is
// guaranteed to match the rules those functions already enforce. The one
// deliberate bypass is Block Budget's rollover: the real `open()` action
// requires every other exercise to be Draft, which Annual Budget no
// longer is once its own cycle is Locked (needed to keep its lines
// visible — see belongsToCurrentCycle) — so this calls the same internal
// rollBlockBudgetForward the real action would call, directly, leaving
// Block Budget's own period at Draft with just its Start Year set
// (a real, valid state — Finance Admin just hasn't clicked Open yet).
export async function loadSampleData(): Promise<void> {
  resetDb();
  const prevUserId = currentUserId;
  try {
    const db = getDb();
    const byName = (name: string) => {
      const u = db.users.find((x) => x.name === name);
      if (!u) throw new Error(`Seed user not found: ${name}`);
      return u;
    };
    const jasonYong = byName('Jason Yong');
    const jeffreyChoy = byName('Jeffrey Choy');
    const pamelaChan = byName('Pamela Chan');
    const feliciaKang = byName('Felicia Kang'); // Branch Rep (also Super Admin)
    const jasonCheah = byName('Jason Cheah'); // Branch Rep (also Super Admin)
    const andyOng = byName('Andy Ong');
    const jonathanTay = byName('Jonathan Tay');
    const kenNg = byName('Ken Ng');
    const raineNg = byName('Raine Ng');
    const chenYu = byName('Chen Yu'); // Finance Officer + Finance Admin
    const limShuYing = byName('Lim Shu Ying'); // Finance Officer
    const tanChunHuat = byName('Tan Chun Huat'); // Finance Officer
    const francineChua = byName('Francine Chua'); // Finance Manager
    const cherylSim = byName('Cheryl Sim'); // CIO — approves in place of the named Approver for any IT project line
    // The generic, one-per-group placeholder users (named after their own
    // group) are seeded Inactive on purpose — reused here to populate the
    // "with Inactive Users" cleanup pages.
    const inactivePlaceholder = byName('SMGT');

    async function submitAs(userId: string, lineId: string) {
      setApiUser(userId);
      await api.budgetLines.submit(lineId);
    }
    async function approveAs(userId: string, lineId: string) {
      setApiUser(userId);
      await api.budgetLines.approve(lineId);
    }
    // RB/OB get a brand-new record every Annual Budget cycle (see
    // rollAnnualBudgetForward), so a given MTP line can have more than one
    // RB/OB generation by the time a second cycle has run — submissionYear
    // (required for those two kinds) picks the right one. BLOCK rolls the
    // same record forward in place, so it never needs one.
    function findBySource(kind: 'OB' | 'RB', sourceMtpLineId: string, submissionYear: number): StoredBudgetLine;
    function findBySource(kind: 'BLOCK', sourceMtpLineId: string): StoredBudgetLine;
    function findBySource(kind: 'OB' | 'RB' | 'BLOCK', sourceMtpLineId: string, submissionYear?: number): StoredBudgetLine {
      const line = db.budgetLines.find(
        (l) => l.kind === kind && l.sourceMtpLineId === sourceMtpLineId && (kind === 'BLOCK' || l.submissionYear === submissionYear)
      );
      if (!line) throw new Error(`Expected a rolled-over ${kind} line for MTP line ${sourceMtpLineId}`);
      return line;
    }

    // ---------- Project 1: Trade Declaration System Enhancement (IT) ----------
    setApiUser(jasonYong.id);
    const project1 = await api.projects.create({
      title: 'Trade Declaration System Enhancement',
      justification:
        'Modernise the trade declaration platform to support real-time risk engine integration and reduce manual processing time.',
    });
    await api.projects.submitRequest(project1.id);
    await api.teamMembers.addMany(project1.id, [pamelaChan.id]);
    const fundingSource1 = db.fundingSources.find((f) => f.name === 'Within the Block (P)')!;
    const fundingSource1Approved = db.fundingSources.find((f) => f.name === 'Within the Block')!;
    const funding1 = await api.funding.create(project1.id, fundingSource1.id);

    setApiUser(chenYu.id);
    await api.projects.update(project1.id, {
      subAccount: 'Q1095 ORION',
      developmentCostCentre: '556789 Customs Systems Modernisation',
      operatingCostCentre: '712045 Trade Facilitation Services',
      financeOfficerId: chenYu.id,
    });
    await api.projects.approve(project1.id);
    // Finance promotes the Pipeline pick to its Approved counterpart and
    // fills in the pot details — this is what makes it show up with real
    // figures on the Project Funding Pot page.
    await api.funding.update(funding1.id, fundingSource1Approved.id);
    await api.funding.updatePotDetails(funding1.id, {
      fundingPotId: 'POT-TDS-2026',
      supportedFund: 500000,
      fundStartDate: '2026-04-01',
      fundExpiryDate: '2029-03-31',
      developmentCostCentre: '556789 Customs Systems Modernisation',
      operatingCostCentre: '712045 Trade Facilitation Services',
    });

    setApiUser(jasonYong.id);
    const aor1 = await api.aors.create(project1.id);
    await api.aors.update(aor1.id, {
      approvedByUserId: raineNg.id,
      approvedDate: '2026-04-01',
      developmentApprovedFund: 250000,
      operatingApprovedFund: 80000,
      startDate: '2026-04-01',
      expiredDate: '2029-03-31',
    });
    setApiUser(chenYu.id);
    await api.aors.confirm(aor1.id);

    // A second, later AOR (a top-up) for the same project — demonstrates
    // "+Add" for more than one AOR per project, and is deliberately left
    // un-confirmed so the per-project AOR tab still has a "Finance
    // Confirmed" action waiting to be clicked.
    setApiUser(jasonYong.id);
    const aor1b = await api.aors.create(project1.id);
    await api.aors.update(aor1b.id, {
      approvedByUserId: raineNg.id,
      approvedDate: '2026-10-01',
      developmentApprovedFund: 30000,
      operatingApprovedFund: 0,
      startDate: '2026-10-01',
      expiredDate: '2031-03-31',
    });

    // ---------- Project 2: Checkpoint Scanner Replacement (non-IT) ----------
    setApiUser(jeffreyChoy.id);
    const project2 = await api.projects.create({
      title: 'Checkpoint Scanner Replacement',
      justification: 'Replace end-of-life X-ray scanning units at three checkpoints to maintain inspection throughput.',
    });
    await api.projects.submitRequest(project2.id);
    const fundingSource2 = db.fundingSources.find((f) => f.name === 'Within the Block (P)')!;
    const fundingSource2Approved = db.fundingSources.find((f) => f.name === 'Within the Block')!;
    const funding2 = await api.funding.create(project2.id, fundingSource2.id);

    setApiUser(limShuYing.id);
    await api.projects.update(project2.id, {
      subAccount: 'Q1126 Checkpoint Digitalisation',
      developmentCostCentre: '256313 IT Application & Technical Services',
      operatingCostCentre: '834210 Container Scanning Operations',
      financeOfficerId: limShuYing.id,
    });
    await api.projects.approve(project2.id);
    await api.funding.update(funding2.id, fundingSource2Approved.id);
    await api.funding.updatePotDetails(funding2.id, {
      fundingPotId: 'POT-CKPT-2026',
      supportedFund: 120000,
      fundStartDate: '2026-04-01',
      fundExpiryDate: '2028-03-31',
      developmentCostCentre: '256313 IT Application & Technical Services',
      operatingCostCentre: '834210 Container Scanning Operations',
    });

    // Project 2's own AOR is deliberately smaller than what it will spend
    // and left un-confirmed — demonstrates the insufficient-balance
    // warning even where an AOR exists (just not enough, and the
    // knock-off check pools confirmed and unconfirmed funds alike), plus
    // another "Finance Confirmed" action still waiting on the per-project
    // AOR tab.
    setApiUser(jeffreyChoy.id);
    const aor2 = await api.aors.create(project2.id);
    await api.aors.update(aor2.id, {
      approvedByUserId: raineNg.id,
      approvedDate: '2026-04-01',
      developmentApprovedFund: 50000,
      operatingApprovedFund: 30000,
      startDate: '2026-04-01',
      expiredDate: '2029-03-31',
    });

    // ---------- Project 3: Border Checkpoint CCTV Upgrade — left Pending ----------
    // Never approved by Finance — populates the Project Profile Request
    // queue. No funding/AOR/budget lines yet; it's too early in its
    // lifecycle for any of those.
    setApiUser(pamelaChan.id);
    const project3 = await api.projects.create({
      title: 'Border Checkpoint CCTV Upgrade',
      justification: 'Install networked CCTV coverage at the border checkpoint to close existing surveillance blind spots.',
    });
    await api.projects.submitRequest(project3.id);

    // ---------- Medium Term Projection lines ----------
    setApiUser(jasonYong.id);
    const lineA = await api.budgetLines.create(project1.id, 'MTP', 2026);
    await api.budgetLines.update(
      lineA.id,
      {
        description: 'Core trade declaration platform rebuild',
        opsOrDev: 'Dev',
        account: '511604 ICT Consultation Services',
        fundingEntryId: funding1.id,
        recurring: 'Yes',
        costCentre: '556789 Customs Systems Modernisation',
        itProject: 'Yes',
        ictExp: 'Application Development & Maintenance',
        buildOrBuy: 'Build',
        basis: 'Vendor quotation for platform redevelopment',
        periods: { FY26: 200000 },
        reviewer1UserId: andyOng.id,
        reviewer2UserId: jonathanTay.id,
        // An IT project's final approval is gated by the CIO group, not
        // this field (see STEP_ACTOR['PENDING_APPROVAL_CIO']) — Cheryl Sim
        // is who actually approves it at the end, below.
        approverUserId: cherylSim.id,
        justifications: { FY26: 'New platform rebuild — first-ever submission, no prior baseline to compare against.' },
      },
      2026
    );

    const lineB = await api.budgetLines.create(project1.id, 'MTP', 2026);
    await api.budgetLines.update(
      lineB.id,
      {
        description: 'Legacy EDI gateway maintenance support contract',
        opsOrDev: 'Ops',
        account: '611602 Maintenance Services',
        fundingEntryId: funding1.id,
        recurring: 'No',
        costCentre: '712045 Trade Facilitation Services',
        itProject: 'No',
        basis: 'Vendor support contract quotation',
        periods: { FY26: 60000, FY27: 60000, FY28: 60000, FY29: 60000, FY30: 60000, FY31: 60000, FY32: 60000 },
        reviewer1UserId: andyOng.id,
        // No Reviewer 2 on this line — approval skips Pending Approval
        // (Reviewer 2) entirely once Clarification (FM) clears it.
        approverUserId: raineNg.id,
        justifications: { FY26: 'New support contract — first-ever submission, no prior baseline to compare against.' },
      },
      2026
    );

    const lineC = await api.budgetLines.create(project1.id, 'MTP', 2026);
    await api.budgetLines.update(
      lineC.id,
      {
        description: 'Trade data analytics dashboard',
        opsOrDev: 'Dev',
        account: '511603 Software as a Service',
        fundingEntryId: funding1.id,
        recurring: 'Yes',
        costCentre: '556789 Customs Systems Modernisation',
        itProject: 'Yes',
        ictExp: 'Software-as-a-Service',
        buildOrBuy: 'Buy',
        basis: 'SaaS subscription estimate based on vendor proposal',
        periods: { FY26: 80000 },
        reviewer1UserId: jonathanTay.id,
        reviewer2UserId: andyOng.id,
        approverUserId: cherylSim.id, // IT project — CIO gates the final approval, not this field
        justifications: { FY26: 'New SaaS subscription — first-ever submission, no prior baseline to compare against.' },
      },
      2026
    );

    setApiUser(jeffreyChoy.id);
    const lineD = await api.budgetLines.createAdHoc('MTP', 2026, null);
    await api.budgetLines.update(
      lineD.id,
      {
        description: 'Checkpoint mobile scanning device maintenance contract',
        opsOrDev: 'Dev',
        account: '511201 IT Equipment',
        recurring: 'No',
        costCentre: '834210 Container Scanning Operations',
        itProject: 'No',
        basis: 'Hardware maintenance contract estimate',
        periods: { FY26: 45000, FY27: 45000, FY28: 45000, FY29: 45000, FY30: 45000, FY31: 45000, FY32: 45000 },
        reviewer1UserId: andyOng.id,
        approverUserId: raineNg.id,
        justifications: { FY26: 'Ad hoc line, not tied to a Project Profile — first-ever submission, no prior baseline.' },
      },
      2026
    );

    const lineE = await api.budgetLines.create(project2.id, 'MTP', 2026);
    await api.budgetLines.update(
      lineE.id,
      {
        description: 'Mobile X-ray unit maintenance — Terminal 3',
        opsOrDev: 'Dev',
        account: '511201 IT Equipment',
        fundingEntryId: funding2.id,
        recurring: 'No',
        costCentre: '834210 Container Scanning Operations',
        itProject: 'No',
        basis: 'Still gathering vendor quotations',
        periods: { FY26: 150000, FY27: 150000 },
        // Left in Draft on purpose — Branch Rep hasn't finished setting
        // Reviewer 1 yet, so it's never submitted. The Approver is
        // tagged to the generic Inactive "SMGT" placeholder, though —
        // populates the "MTP with Inactive Users" cleanup page.
        approverUserId: inactivePlaceholder.id,
      },
      2026
    );

    setApiUser(jasonYong.id);
    const lineF = await api.budgetLines.create(project1.id, 'MTP', 2026);
    await api.budgetLines.update(
      lineF.id,
      {
        description: 'Branch office cleaning and facilities contract',
        opsOrDev: 'Ops',
        account: '611601 Cleaning Services',
        fundingEntryId: funding1.id,
        recurring: 'No',
        costCentre: '712045 Trade Facilitation Services',
        itProject: 'No',
        basis: 'Facilities contract quotation',
        periods: { FY26: 30000, FY27: 30000, FY28: 30000, FY29: 30000, FY30: 30000, FY31: 30000, FY32: 30000 },
        reviewer1UserId: andyOng.id,
        approverUserId: raineNg.id,
        justifications: { FY26: 'New facilities contract — first-ever submission, no prior baseline to compare against.' },
      },
      2026
    );

    const lineG = await api.budgetLines.create(project1.id, 'MTP', 2026);
    await api.budgetLines.update(
      lineG.id,
      {
        description: 'Overtime allowance for peak clearance season',
        opsOrDev: 'Ops',
        account: '611102 Overtime Pay',
        fundingEntryId: funding1.id,
        recurring: 'No',
        costCentre: '712045 Trade Facilitation Services',
        itProject: 'No',
        basis: 'Historical overtime claims analysis',
        periods: { FY26: 40000, FY27: 40000, FY28: 40000, FY29: 40000, FY30: 40000, FY31: 40000, FY32: 40000 },
        reviewer1UserId: andyOng.id,
        reviewer2UserId: kenNg.id,
        approverUserId: raineNg.id,
        justifications: { FY26: 'New overtime allowance — first-ever submission, no prior baseline to compare against.' },
      },
      2026
    );

    // Drive the lines through their respective workflow stages.
    setApiUser(jasonYong.id);
    await submitAs(jasonYong.id, lineA.id);
    await submitAs(jasonYong.id, lineB.id);
    await submitAs(jasonYong.id, lineC.id);
    await submitAs(jasonYong.id, lineF.id);
    await submitAs(jasonYong.id, lineG.id);
    setApiUser(jeffreyChoy.id);
    await submitAs(jeffreyChoy.id, lineD.id);

    // Line A: full chain through to Approved (has a Reviewer 2).
    await approveAs(andyOng.id, lineA.id); // Reviewer 1 -> Clarification (FO)
    await approveAs(chenYu.id, lineA.id); // Finance Officer -> Clarification (FM)
    await approveAs(francineChua.id, lineA.id); // Finance Manager -> Pending Approval (Reviewer 2)
    await approveAs(jonathanTay.id, lineA.id); // Reviewer 2 -> Pending Approval (CIO), since this is an IT project
    await approveAs(cherylSim.id, lineA.id); // CIO -> Approved

    // Line B: full chain through to Approved, with no Reviewer 2 — skips
    // Pending Approval (Reviewer 2) entirely after Clarification (FM).
    await approveAs(andyOng.id, lineB.id);
    await approveAs(chenYu.id, lineB.id);
    await approveAs(francineChua.id, lineB.id); // -> straight to Pending Approval (Approver)
    await approveAs(raineNg.id, lineB.id); // -> Approved

    // Line C: left at Clarification (FO), pending Finance Officer action —
    // populates the Review Phase action queue for a live demo.
    await approveAs(jonathanTay.id, lineC.id);

    // Line D: left at Review, pending Reviewer 1 (Andy Ong) — also
    // populates the Review Phase action queue.
    // (nothing further — already submitted above)

    // Line E stays in Draft, untouched.

    // Line F: left at Clarification (FM), pending Finance Manager action —
    // populates the Clarification (FM) action queue specifically.
    await approveAs(andyOng.id, lineF.id);
    await approveAs(chenYu.id, lineF.id);

    // Line G: left at Pending Approval (Reviewer 2) — populates the
    // Approval Phase action queue with a Reviewer-2-pending example,
    // distinct from A/B which already went all the way through.
    await approveAs(andyOng.id, lineG.id);
    await approveAs(chenYu.id, lineG.id);
    await approveAs(francineChua.id, lineG.id);

    // ---------- Scale up to 30 Project Profiles ----------
    // Pad Projects 1 & 2 to 10 MTP lines each (Project 3 stays at 0 — it's
    // deliberately left Pending for the Project Profile Request queue demo,
    // with nothing approved yet to attach a line to), then add 27 more
    // Project Profiles — 5 "showcase" ones with an Approved External Source
    // of Funding (their Project FY Status figures are tuned further below
    // to demonstrate Project FY Status (External) and Project Loan Pot),
    // plus 22 plain Approved, Internally-funded ones for volume — each with
    // 10 MTP lines, and 9 more ad hoc MTP lines (on top of Line D) to reach
    // 10 ad hoc as well. This all has to happen before Annual Budget first
    // opens below so every one of these lines' Original/Revised/Block
    // Budget counterparts roll forward in the same pass as the lines above.
    //
    // Every filler line is Recurring = Yes with only its first FY given —
    // applyRecurringInflation fills in the rest on its own (see
    // budgetLines.update) — so Original Budget, Revised Budget and Block
    // Budget all end up with real, nonzero figures automatically; nothing
    // here needs to be driven through the submit/approve workflow by hand.
    const ACCOUNT_COST_CENTRE_PAIRS: Array<[string, string]> = [
      ['511604 ICT Consultation Services', '556789 Customs Systems Modernisation'],
      ['611602 Maintenance Services', '712045 Trade Facilitation Services'],
      ['511603 Software as a Service', '556789 Customs Systems Modernisation'],
      ['511201 IT Equipment', '834210 Container Scanning Operations'],
      ['611601 Cleaning Services', '712045 Trade Facilitation Services'],
      ['611102 Overtime Pay', '712045 Trade Facilitation Services'],
    ];
    async function addFillerLine(projectId: string | null, ownerUserId: string, seq: number, baseAmount: number, fundingEntryId: string | null) {
      setApiUser(ownerUserId);
      const [account, costCentre] = ACCOUNT_COST_CENTRE_PAIRS[seq % ACCOUNT_COST_CENTRE_PAIRS.length];
      const line = projectId ? await api.budgetLines.create(projectId, 'MTP', 2026) : await api.budgetLines.createAdHoc('MTP', 2026, null);
      await api.budgetLines.update(
        line.id,
        {
          description: `Recurring Operating Expenditure Line ${seq}`,
          opsOrDev: 'Ops',
          account,
          fundingEntryId,
          recurring: 'Yes',
          costCentre,
          itProject: 'No',
          basis: 'Baseline estimate for recurring operating expenditure.',
          periods: { FY26: baseAmount },
        },
        2026
      );
      return line;
    }

    for (let seq = 6; seq <= 10; seq++) {
      await addFillerLine(project1.id, jasonYong.id, seq, 15000 + seq * 1000, funding1.id);
    }
    for (let seq = 2; seq <= 10; seq++) {
      await addFillerLine(project2.id, jeffreyChoy.id, seq, 12000 + seq * 1000, funding2.id);
    }
    // 9 more ad hoc MTP lines, on top of Line D, to reach 10 ad hoc total.
    for (let seq = 2; seq <= 10; seq++) {
      await addFillerLine(null, jeffreyChoy.id, seq, 10000 + seq * 500, null);
    }

    const EXTERNAL_SOURCE_PAIRS: Array<[string, string]> = [
      ['Above the Block (P)', 'Above the Block'],
      ['Central Digitalisation Board (P)', 'Central Digitalisation Board'],
      ['Initial Budget (P)', 'Initial Budget'],
    ];
    const INTERNAL_SOURCE_PAIR: [string, string] = ['Within the Block (P)', 'Within the Block'];
    const PROJECT_COST_CENTRE_PAIRS: Array<[string, string]> = [
      ['556789 Customs Systems Modernisation', '712045 Trade Facilitation Services'],
      ['256313 IT Application & Technical Services', '834210 Container Scanning Operations'],
    ];
    const BULK_PROJECT_TITLES = [
      'Coastal Surveillance Radar Network', // showcase 0 — tuned to Excess below
      'Immigration Biometric Kiosk Rollout', // showcase 1 — tuned to Excess below
      'Cargo Clearance Analytics Platform', // showcase 2 — tuned to Deficit below
      'Port Security Sensor Upgrade', // showcase 3 — tuned to Deficit below
      'Customs Document Digitisation Suite', // showcase 4 — tuned to Balanced below
      'Warehouse Inventory Tracking System',
      'Vehicle Checkpoint Automation',
      'Air Cargo Risk Profiling Tool',
      'Marine Vessel Clearance Portal',
      'Bonded Warehouse Licensing System',
      'Trade Statistics Reporting Platform',
      'Passenger Baggage Screening Upgrade',
      'Container Yard Management System',
      'Customs Brokerage Integration Hub',
      'Excise Duty Collection Modernisation',
      'K9 Unit Operations Support System',
      'Perimeter Fencing Sensor Network',
      'Staff Training Simulation Platform',
      'Fleet Maintenance Scheduling System',
      'Document Verification AI Assistant',
      'Cross-Border Data Exchange Gateway',
      'Mobile Patrol Communication Upgrade',
      'Inspection Checklist Digitalisation',
      'Licence Application Self-Service Portal',
      'Drone Surveillance Pilot Programme',
      'Archive Digitisation Initiative',
      'Help Desk Ticketing System Upgrade',
    ];
    const BULK_BRANCH_REPS = [jasonYong, jeffreyChoy, pamelaChan, feliciaKang, jasonCheah];
    const BULK_FINANCE_OFFICERS = [chenYu, limShuYing, tanChunHuat];
    const BULK_SUB_ACCOUNTS = ['Q1095 ORION', 'Q1126 Checkpoint Digitalisation'];

    // Collected so the Project FY Status (External) tuning block below can
    // find each showcase project's first MTP line (and from there, its
    // rolled-over Revised/Original Budget lines).
    const showcaseProjectIds: string[] = [];
    const showcaseMtpLineIds: string[] = [];

    for (let i = 0; i < BULK_PROJECT_TITLES.length; i++) {
      const isShowcase = i < 5;
      const branchRep = BULK_BRANCH_REPS[i % BULK_BRANCH_REPS.length];
      const financeOfficer = BULK_FINANCE_OFFICERS[i % BULK_FINANCE_OFFICERS.length];
      const [devCc, opCc] = PROJECT_COST_CENTRE_PAIRS[i % PROJECT_COST_CENTRE_PAIRS.length];
      const subAccount = BULK_SUB_ACCOUNTS[i % BULK_SUB_ACCOUNTS.length];

      setApiUser(branchRep.id);
      const project = await api.projects.create({
        title: BULK_PROJECT_TITLES[i],
        justification: `Sample data generated to demonstrate ORION at a realistic (30 Project Profile) scale: ${BULK_PROJECT_TITLES[i]}.`,
      });
      await api.projects.submitRequest(project.id);
      const [pipelineName, approvedName] = isShowcase ? EXTERNAL_SOURCE_PAIRS[i % EXTERNAL_SOURCE_PAIRS.length] : INTERNAL_SOURCE_PAIR;
      const pipelineSource = db.fundingSources.find((f) => f.name === pipelineName)!;
      const approvedSource = db.fundingSources.find((f) => f.name === approvedName)!;
      const fundingEntry = await api.funding.create(project.id, pipelineSource.id);

      setApiUser(financeOfficer.id);
      await api.projects.update(project.id, {
        subAccount,
        developmentCostCentre: devCc,
        operatingCostCentre: opCc,
        financeOfficerId: financeOfficer.id,
      });
      await api.projects.approve(project.id);
      const potDetails = {
        fundingPotId: `POT-BULK-${i + 1}`,
        supportedFund: 300000 + i * 10000,
        fundStartDate: '2026-04-01',
        fundExpiryDate: '2030-03-31',
        developmentCostCentre: devCc,
        operatingCostCentre: opCc,
      };
      if (isShowcase) {
        // External — pot details have to exist before Finance can approve
        // it (see funding.update()'s validation), so fill those in first.
        await api.funding.updatePotDetails(fundingEntry.id, potDetails);
        await api.funding.update(fundingEntry.id, approvedSource.id);
      } else {
        // Internal — no such validation, but fill the same details in
        // anyway so every Approved pot shows up fully filled-in.
        await api.funding.update(fundingEntry.id, approvedSource.id);
        await api.funding.updatePotDetails(fundingEntry.id, potDetails);
      }

      let firstLineId: string | null = null;
      for (let seq = 1; seq <= 10; seq++) {
        const line = await addFillerLine(project.id, branchRep.id, seq, 10000 + seq * 1500 + i * 200, fundingEntry.id);
        if (seq === 1) firstLineId = line.id;
      }
      if (isShowcase) {
        showcaseProjectIds.push(project.id);
        showcaseMtpLineIds.push(firstLineId!);
      }
    }

    // ---------- Annual Budget: open (bootstraps Original Budget from MTP) ----------
    setApiUser(chenYu.id);
    await api.budgetPeriods.open('ANNUAL', '2026-04-01', '2027-03-31');
    // First-ever cycle: Revised Budget starts empty (nothing to duplicate
    // from yet) — this is expected, not a bug.

    const obKeys = periodKeys('OB', 2027);
    const monthly = (total: number) => Object.fromEntries(obKeys.map((k) => [k, Math.round((total / obKeys.length) * 100) / 100]));

    const obA = findBySource('OB', lineA.id, 2027);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(
      obA.id,
      {
        // OB inherits MTP's Recurring flag on bootstrap (see
        // rollAnnualBudgetForward's freshLine) — Line A is itself
        // recurring, but that flag means something different across 12
        // months within one FY than across years, so switch it off before
        // setting plain monthly figures (otherwise update()'s recurring-
        // growth recompute would treat each month as "a year later" and
        // distort every month after the first).
        recurring: 'No',
        periods: monthly(300000), // deliberately exceeds the AOR's 250,000 Development fund
        reviewer1UserId: andyOng.id,
        approverUserId: cherylSim.id, // IT project — CIO gates the final approval, not this field
        justificationForVariance: 'Scope grew to include the real-time risk engine integration originally planned for a later phase.',
      },
      2027
    );
    await submitAs(jasonYong.id, obA.id);
    await approveAs(andyOng.id, obA.id);
    await approveAs(chenYu.id, obA.id);
    await approveAs(francineChua.id, obA.id); // no Reviewer 2 -> straight to Pending Approval (CIO), IT project
    await approveAs(cherylSim.id, obA.id); // CIO -> Approved

    const obB = findBySource('OB', lineB.id, 2027);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(
      obB.id,
      {
        periods: monthly(60000), // comfortably within the AOR's 80,000 Operating fund
        reviewer1UserId: andyOng.id,
        approverUserId: raineNg.id,
        justificationForVariance: 'Support contract renewed at the same annual rate as planned.',
      },
      2027
    );
    await submitAs(jasonYong.id, obB.id);
    await approveAs(andyOng.id, obB.id); // left at Clarification (FO), pending Finance Officer

    // obC/obD/obE/obF/obG (the rest of this cycle's Original Budget,
    // bootstrapped from lines C, D, E, F, G) are left exactly as Finance
    // Admin's rollover produced them — Draft, zero periods, no
    // reviewers — Branch Rep hasn't gotten to them yet.

    setApiUser(chenYu.id);
    await api.budgetPeriods.lock('ANNUAL'); // flows the Approved OB total back into MTP's FY27 figure

    // ---------- Annual Budget cycle 2: Revised Budget gets real data ----------
    // Reset the just-finished cycle back to Draft to free the exercise's
    // slot (the real, Finance-Admin-only action), then open the next FY —
    // this duplicates cycle 1's Original Budget into this cycle's Revised
    // Budget (empty on cycle 1 since there was no prior cycle to duplicate
    // from — now it has real rows) and bootstraps a fresh Original Budget
    // for the FY after that from Medium Term Projection's current state.
    await api.budgetPeriods.resetToDraft('ANNUAL');
    await api.budgetPeriods.open('ANNUAL', '2027-04-01', '2028-03-31');

    const rbA = findBySource('RB', lineA.id, 2027);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(
      rbA.id,
      {
        periods: monthly(320000), // a further 20,000 increase over the 300,000 Approved Original Budget baseline
        reviewer1UserId: andyOng.id,
        approverUserId: cherylSim.id, // IT project — CIO gates the final approval
        justificationForVariance: 'Additional licensing costs identified during implementation.',
      },
      2027
    );
    await submitAs(jasonYong.id, rbA.id);
    await approveAs(andyOng.id, rbA.id);
    await approveAs(chenYu.id, rbA.id);
    await approveAs(francineChua.id, rbA.id); // no Reviewer 2 -> straight to Pending Approval (CIO), IT project
    await approveAs(cherylSim.id, rbA.id); // CIO -> Approved

    const rbB = findBySource('RB', lineB.id, 2027);
    setApiUser(jasonYong.id);
    // Left exactly as duplicated (no edits — no variance, no justification
    // needed to submit) other than picking its Reviewer 1/Approver again
    // (every Revised/Original Budget line starts a cycle with none set,
    // even one duplicated from last cycle's line).
    await api.budgetLines.update(rbB.id, { reviewer1UserId: andyOng.id, approverUserId: raineNg.id }, 2027);
    await submitAs(jasonYong.id, rbB.id);
    await approveAs(andyOng.id, rbB.id); // left at Clarification (FO), pending Finance Officer

    // rbC/rbD/rbE/rbF/rbG are left exactly as duplicated — Draft, no
    // reviewers — Branch Rep hasn't gotten to them yet.

    // Tag rbC's Finance Officer to the Inactive "SMGT" placeholder — rbC
    // (not obC, which stops being the "current cycle" the moment this
    // cycle opens — see belongsToCurrentCycle) is what stays visible on
    // Annual Budget's "with Inactive Users" cleanup page going forward.
    const rbC = findBySource('RB', lineC.id, 2027);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(rbC.id, { financeOfficerUserId: inactivePlaceholder.id }, 2027);

    const obA2 = findBySource('OB', lineA.id, 2028);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(
      obA2.id,
      {
        periods: monthly(350000), // continues to exceed the AOR's Development fund
        reviewer1UserId: andyOng.id,
        approverUserId: cherylSim.id,
        justificationForVariance: 'Scope grew to include the real-time risk engine integration originally planned for a later phase.',
      },
      2028
    );
    await submitAs(jasonYong.id, obA2.id);
    await approveAs(andyOng.id, obA2.id);
    await approveAs(chenYu.id, obA2.id);
    await approveAs(francineChua.id, obA2.id);
    await approveAs(cherylSim.id, obA2.id); // CIO -> Approved

    const obB2 = findBySource('OB', lineB.id, 2028);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(
      obB2.id,
      {
        periods: monthly(65000),
        reviewer1UserId: andyOng.id,
        approverUserId: raineNg.id,
        justificationForVariance: 'Slight increase in contracted support hours.',
      },
      2028
    );
    await submitAs(jasonYong.id, obB2.id);
    await approveAs(andyOng.id, obB2.id); // left at Clarification (FO)

    // obC2/obD2/obF2/obG2 (this cycle's fresh Original Budget for lines C,
    // D, F, G) are left exactly as bootstrapped — Draft, zero periods, no
    // reviewers. Line E has nothing here at all: it never grew a FY28
    // figure in Medium Term Projection, so there was nothing to carry
    // forward (see rollAnnualBudgetForward's "drop if zeroed out" rule).

    // ---------- Project FY Status (External): tune the 5 showcase
    // projects' current-cycle Revised Budget (FY27) and next-cycle
    // Original Budget (FY28) totals ----------
    // Via each showcase project's first MTP line's rolled-over RB/OB
    // counterparts, to land on a specific Balanced/Deficit/Excess outcome
    // (see computeExternalProjectFyStatuses: difference = FY Original
    // Budget - FY Revised Budget). This has to happen before Annual
    // Budget locks below — once Closed and Locked, only Finance Admin can
    // reopen it for edits (see requireBudgetPeriodEditable). Both lines
    // inherit Recurring = Yes from their MTP parent, so it has to be
    // switched off first — otherwise budgetLines.update's recurring-
    // growth recompute would distort the flat monthly figure being set
    // here (same reason obA/obB above do the same). Each showcase
    // project's own owning Branch Rep has to be the one editing its
    // lines (same rule as everywhere else — see isOwningBranchRep), not
    // Finance.
    async function setShowcaseFyAmounts(mtpLineId: string, ownerUserId: string, revisedBudgetTotal: number, originalBudgetTotal: number) {
      setApiUser(ownerUserId);
      const rb = findBySource('RB', mtpLineId, 2027);
      await api.budgetLines.update(rb.id, { recurring: 'No', periods: flatMonthly(2027, revisedBudgetTotal) }, 2027);
      const ob = findBySource('OB', mtpLineId, 2028);
      await api.budgetLines.update(ob.id, { recurring: 'No', periods: flatMonthly(2028, originalBudgetTotal) }, 2028);
    }
    const [coastalMtpId, immigrationMtpId, cargoMtpId, portSecurityMtpId, customsDocMtpId] = showcaseMtpLineIds;
    // Showcase index -> owning Branch Rep: 0 Jason Yong, 1 Jeffrey Choy, 2
    // Pamela Chan, 3 Felicia Kang, 4 Jason Cheah (see BULK_BRANCH_REPS above).
    await setShowcaseFyAmounts(coastalMtpId, jasonYong.id, 100000, 150000); // Excess: +50,000
    await setShowcaseFyAmounts(immigrationMtpId, jeffreyChoy.id, 80000, 130000); // Excess: +50,000
    await setShowcaseFyAmounts(cargoMtpId, pamelaChan.id, 150000, 100000); // Deficit: -50,000
    await setShowcaseFyAmounts(portSecurityMtpId, feliciaKang.id, 120000, 70000); // Deficit: -50,000
    await setShowcaseFyAmounts(customsDocMtpId, jasonCheah.id, 90000, 90000); // Balanced: 0

    setApiUser(chenYu.id);
    await api.budgetPeriods.lock('ANNUAL'); // flows the Approved OB total back into MTP's FY28 figure — this is the exercise's final, Closed-and-Locked state.

    // ---------- Block Budget: roll forward from MTP ----------
    // The real `open()` action requires every other exercise to be Draft,
    // which Annual Budget no longer is (kept Locked on purpose so its OB
    // lines stay visible — see belongsToCurrentCycle). Block Budget lines
    // are never filtered by cycle, so calling the same rollover the real
    // action would call, directly, is safe and produces identical data;
    // only the exercise's own period record ends up at Draft (with its
    // Start Year already set) instead of Open, which Finance Admin can
    // still do for real at any time — re-running the rollover is
    // idempotent (updates existing lines in place, never duplicates).
    await api.budgetPeriods.setBlockBudgetStartYear(2028);
    rollBlockBudgetForward(2028, chenYu.id);
    saveDb();

    const blockA = findBySource('BLOCK', lineA.id);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(
      blockA.id,
      {
        reviewer1UserId: jonathanTay.id,
        reviewer2UserId: andyOng.id,
        approverUserId: cherylSim.id, // IT project — CIO gates the final approval
        // Rounding in the recurring-growth formula means a couple of this
        // window's consecutive years land a hair over the 5% IT threshold
        // even though the underlying rate is exactly 5% — cover every
        // year after the window's first (which is never flagged) so
        // whichever one Block Budget's own variance check picks is ready.
        justifications: {
          FY29: 'Consistent with the platform rebuild’s planned 5% p.a. IT growth rate.',
          FY30: 'Consistent with the platform rebuild’s planned 5% p.a. IT growth rate.',
          FY31: 'Consistent with the platform rebuild’s planned 5% p.a. IT growth rate.',
          FY32: 'Consistent with the platform rebuild’s planned 5% p.a. IT growth rate.',
        },
      },
      2028
    );
    await submitAs(jasonYong.id, blockA.id);
    await approveAs(jonathanTay.id, blockA.id);
    await approveAs(chenYu.id, blockA.id);
    await approveAs(francineChua.id, blockA.id); // has a Reviewer 2 -> Pending Approval (Reviewer 2)
    await approveAs(andyOng.id, blockA.id); // Reviewer 2 -> Pending Approval (CIO), IT project
    await approveAs(cherylSim.id, blockA.id); // CIO -> Approved

    const blockB = findBySource('BLOCK', lineB.id);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(blockB.id, { reviewer1UserId: andyOng.id, approverUserId: raineNg.id }, 2028);
    await submitAs(jasonYong.id, blockB.id);
    await approveAs(andyOng.id, blockB.id); // left at Clarification (FO)

    // blockC/blockD/blockE/blockF/blockG are left exactly as the rollover
    // produced them — Draft, no reviewers — same "not yet touched"
    // variety as their MTP and Original Budget counterparts. blockC gets
    // one reviewer tagged to the Inactive "SMGT" placeholder, though —
    // populates Block Budget's own "with Inactive Users" cleanup page
    // (Block lines are never filtered by cycle, so this stays visible
    // regardless of anything Annual Budget does above).
    const blockC = findBySource('BLOCK', lineC.id);
    setApiUser(jasonYong.id);
    await api.budgetLines.update(blockC.id, { reviewer1UserId: inactivePlaceholder.id }, 2028);

    // ---------- Project Loan Pot demo data ----------
    // (Project FY Status (External)'s own showcase figures were tuned
    // further up, right before Annual Budget's cycle-2 lock().)
    const [coastalProjectId, immigrationProjectId, cargoProjectId, portSecurityProjectId] = showcaseProjectIds;
    // Loan 1: Coastal Surveillance (Excess) lends to Cargo Clearance
    // (Deficit) — left Open, with its auto-created Return Loan / Return
    // from Loan lines visible on Project Loan Pot.
    setApiUser(francineChua.id);
    await api.loanPots.create({ loanFromProjectId: coastalProjectId, loanToProjectId: cargoProjectId, loanAmount: 30000 });
    // Loan 2: Immigration Biometric (Excess) lends to Port Security
    // (Deficit) — closed straight away, to demonstrate the Closed state too.
    const loan2 = await api.loanPots.create({ loanFromProjectId: immigrationProjectId, loanToProjectId: portSecurityProjectId, loanAmount: 20000 });
    await api.loanPots.close(loan2.id);

    // ---------- Final period statuses: one Open exercise to play with,
    // the other two Closed and Locked (with the real data built above,
    // read-only to everyone but Super Admin) ----------
    // Medium Term Projection was left Draft throughout (fully editable
    // either way, so there was never a need to touch it while building
    // the data above) — bake it to Open now, its own real "currently
    // active" state, with Lines C/D/F/G's pending actions and Line E's
    // Draft all genuinely actionable/editable by their respective actors.
    // Annual Budget is already Locked from its own real lock() call
    // above; Block Budget is bypassed the same way its rollover was
    // (direct period mutation, since the real `open()` action can't run
    // a second time here — see the comment above rollBlockBudgetForward)
    // so it also ends Closed and Locked rather than lingering at Draft.
    const mtpPeriod = db.budgetPeriods.find((p) => p.type === 'MTP')!;
    mtpPeriod.status = 'Open';
    mtpPeriod.startDate = '2026-04-01';
    mtpPeriod.endDate = '2027-03-31';
    mtpPeriod.updatedAt = now();
    const blockPeriod = db.budgetPeriods.find((p) => p.type === 'BLOCK')!;
    blockPeriod.status = 'Locked';
    blockPeriod.startDate = '2028-04-01';
    blockPeriod.endDate = '2033-03-31';
    blockPeriod.updatedAt = now();
    saveDb();
  } catch (e) {
    // A seeding failure would otherwise leave a half-built, inconsistent
    // demo in place (and the UI's own "already seeded?" checks, if any
    // existed, would never retry it) — fall back to a clean, working,
    // empty app rather than a broken one.
    console.error('loadSampleData failed, resetting to a clean empty state', e);
    resetDb();
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    setApiUser(prevUserId);
  }
}
