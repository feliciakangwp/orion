// Pure client-side, in-browser implementation of the ORION API.
//
// This runs entirely in localStorage (see local/db.ts) instead of calling a
// server — there is no backend to deploy. Every permission/workflow rule is
// enforced here against whichever User is currently "impersonated" (see
// AuthContext.tsx), the same way a real server would enforce it against a
// logged-in session.
import { getDb, nextId, saveDb, type StoredBudgetLine } from './local/db';
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
        if (line.step !== 'DRAFT') throw new Error('Only lines still in Draft can be deleted');
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
};
