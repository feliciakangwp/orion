// Pure client-side, in-browser implementation of the ORION API.
//
// This runs entirely in localStorage (see local/db.ts) instead of calling a
// server — there is no backend to deploy. Every permission/workflow rule is
// enforced here against whichever User is currently "impersonated" (see
// AuthContext.tsx), the same way a real server would enforce it against a
// logged-in session.
import { getDb, nextId, saveDb, type StoredBudgetLine } from './local/db';
import { applyRecurringInflation, emptyPeriods, fyOfDate, periodKeys, sumPeriods } from './lib/calc';
import { canActOnBudgetPeriod, effectiveBudgetPeriodStatus, exerciseTypeForKind, EXERCISE_LABEL } from './lib/budgetPeriod';
import {
  canApprove,
  canCreateProject,
  canManageFinanceAdminCatalog,
  canSeeLine,
  canSubmit,
  isEditableByBranchRep,
  isFinance,
  isFinanceOrFinanceAdmin,
  isOwningBranchRep,
  isSuperAdmin,
  nextOnApprove,
  nextOnSubmit,
  statusFor,
  userCanAct,
} from './lib/workflow';
import type {
  AccountCode,
  BudgetExerciseType,
  BudgetKind,
  BudgetLine,
  BudgetPeriod,
  CostCentreCode,
  FundingEntry,
  FundingSource,
  Group,
  HistoryEntry,
  Project,
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
// BRANCH_REP_DRAFT so the Branch Rep can edit it for the new cycle.
function rollMtpLinesForward(newStartYear: number, byUserId: string) {
  const db = getDb();
  const newKeys = periodKeys('MTP', newStartYear);
  for (const line of db.budgetLines) {
    if (line.kind !== 'MTP') continue;
    const oldPeriods = line.periods;
    let newPeriods: Record<string, number>;
    if (line.recurring === 'Yes') {
      const oldFirstKey = Object.keys(oldPeriods)[0];
      const baseAmount = Number(oldPeriods[newKeys[0]] ?? oldPeriods[oldFirstKey] ?? 0);
      newPeriods = applyRecurringInflation('MTP', newStartYear, 'Yes', line.itProject, baseAmount);
    } else {
      newPeriods = {};
      for (const key of newKeys) newPeriods[key] = oldPeriods[key] ?? 0;
    }
    line.periods = newPeriods;
    const from = line.step;
    line.step = 'BRANCH_REP_DRAFT';
    pushHistory(line, byUserId, 'rollover', from, line.step, `Rolled forward to the ${newKeys[0]}–${newKeys[newKeys.length - 1]} Medium Term Projection window`);
    line.updatedAt = now();
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
    create: (data: { code: string; description: string }) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add an Account');
        if (!data.code.trim() || !data.description.trim()) throw new Error('Account code and description are required');
        const account: AccountCode = {
          id: nextId('acct'),
          code: data.code.trim(),
          description: data.description.trim(),
          createdAt: now(),
        };
        getDb().accountCodes.push(account);
        saveDb();
        return account;
      }),
  },

  costCentres: {
    list: () => run(() => getDb().costCentres),
    create: (data: { code: string; description: string }) =>
      run(() => {
        const user = requireUser();
        if (!canManageFinanceAdminCatalog(user)) throw new Error('Only Finance Admin can add a Cost Centre');
        if (!data.code.trim() || !data.description.trim()) throw new Error('Cost Centre code and description are required');
        const costCentre: CostCentreCode = {
          id: nextId('cc'),
          code: data.code.trim(),
          description: data.description.trim(),
          createdAt: now(),
        };
        getDb().costCentres.push(costCentre);
        saveDb();
        return costCentre;
      }),
  },

  projects: {
    list: () => run(() => getDb().projects),
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
          createdAt: now(),
          updatedAt: now(),
        };
        getDb().fundingEntries.push(entry);
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
    // Cross-project view for Medium Term Projection > Budget Line Item: every
    // MTP-kind line the acting user can see, whether it belongs to a Project
    // Profile or is a standalone ad hoc line (projectId === null).
    listAllMtp: () =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const teamMembersByProject = new Map<string, string[]>();
        for (const m of db.teamMembers) {
          const arr = teamMembersByProject.get(m.projectId) ?? [];
          arr.push(m.userId);
          teamMembersByProject.set(m.projectId, arr);
        }
        return db.budgetLines
          .filter((l) => l.kind === 'MTP')
          .filter((l) => canSeeLine(l, user, l.projectId ? teamMembersByProject.get(l.projectId) ?? [] : []))
          .map(withComputed);
      }),
    create: (projectId: string, kind: BudgetKind, simulationYear: number, origin: 'new' | 'carried_forward' = 'new') =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can add a budget line');
        requireBudgetPeriodEditable(kind, user);
        const line: StoredBudgetLine = {
          id: nextId('line'),
          projectId: project.id,
          kind,
          origin,
          step: 'BRANCH_REP_DRAFT',
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
          periods: emptyPeriods(kind, simulationYear),
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
    // Adds a Budget Line Item from Medium Term Projection, independent of any
    // project tab. `projectId` is null for an ad hoc line (no Project
    // Profile; owned by the acting user) or the id of a project the acting
    // user is a team member of (or owning Branch Rep of) — in that case the
    // line is owned by that project's Branch Rep, exactly as if it had been
    // added from that project's own MTP tab, so it shows up there too.
    createAdHoc: (simulationYear: number, projectId: string | null) =>
      run(() => {
        const user = requireUser();
        requireBudgetPeriodEditable('MTP', user);
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
          kind: 'MTP',
          origin: 'new',
          step: 'BRANCH_REP_DRAFT',
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
          budgetType: null,
          periods: emptyPeriods('MTP', simulationYear),
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
    // own MTP tab too, since it's the same underlying record.
    setProject: (id: string, projectId: string | null) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        if (line.kind !== 'MTP') throw new Error('Only Medium Term Projection lines can be attached to a project here');
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
          'reviewer2UserId',
          'approverUserId',
          'financeOfficerUserId',
        ] as const;
        for (const field of EDITABLE_FIELDS) {
          if (field in data) (line as any)[field] = (data as any)[field];
        }
        if (!line.itProject || line.itProject !== 'Yes') {
          line.ictExp = '';
          line.buildOrBuy = '';
        }

        const keys = periodKeys(line.kind, simulationYear);
        if ('periods' in data) {
          const incoming = data.periods as Record<string, number>;
          if (line.recurring === 'Yes') {
            const baseAmount = Number(incoming[keys[0]] ?? line.periods[keys[0]] ?? 0);
            line.periods = applyRecurringInflation(line.kind, simulationYear, line.recurring, line.itProject, baseAmount);
          } else {
            line.periods = { ...emptyPeriods(line.kind, simulationYear), ...line.periods, ...incoming };
          }
        } else if ('recurring' in data || 'itProject' in data) {
          if (line.recurring === 'Yes') {
            const baseAmount = Number(line.periods[keys[0]] ?? 0);
            line.periods = applyRecurringInflation(line.kind, simulationYear, line.recurring, line.itProject, baseAmount);
          }
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
        if (line.step !== 'BRANCH_REP_DRAFT') throw new Error('Only lines still in Draft can be deleted');
        requireBudgetPeriodEditable(line.kind, user);
        db.budgetLines = db.budgetLines.filter((l) => l.id !== id);
        saveDb();
      }),
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
        if (!line.reviewer1UserId) throw new Error('Reviewer 1 must be selected before submitting');
        if (line.step === 'BRANCH_REP_READY' && (!line.reviewer2UserId || !line.approverUserId)) {
          throw new Error('Reviewer 1, Reviewer 2 and Approver must all be selected before submitting for final approval');
        }
        const from = line.step;
        line.step = nextOnSubmit(line.step);
        pushHistory(line, user.id, 'submit', from, line.step);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    approve: (id: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = owningProjectOf(line);
        if (!canApprove(line.step)) throw new Error('This line is not awaiting approval');
        if (!userCanAct(line, user, project)) throw new Error('You are not the assigned approver for this step');
        requireBudgetPeriodEditable(line.kind, user);
        if (line.step === 'FIN_OFFICER_R1' || line.step === 'FIN_OFFICER_R2') {
          line.financeOfficerUserId = user.id;
        }
        const from = line.step;
        line.step = nextOnApprove(line.step);
        pushHistory(line, user.id, 'approve', from, line.step);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    return: (id: string, note?: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = owningProjectOf(line);
        if (!userCanAct(line, user, project)) throw new Error('You are not the assigned approver for this step');
        requireBudgetPeriodEditable(line.kind, user);
        const from = line.step;
        line.step = 'BRANCH_REP_DRAFT';
        pushHistory(line, user.id, 'return', from, line.step, note);
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

        if (type === 'MTP') rollMtpLinesForward(fyOfDate(startDate), user.id);

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
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can add team members');
        const existing = new Set(db.teamMembers.filter((m) => m.projectId === project.id).map((m) => m.userId));
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
};
