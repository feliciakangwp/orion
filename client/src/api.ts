// Pure client-side, in-browser implementation of the ORION API.
//
// This runs entirely in localStorage (see local/db.ts) instead of calling a
// server — there is no backend to deploy. Every permission/workflow rule is
// enforced here against whichever User is currently "impersonated" (see
// AuthContext.tsx), the same way a real server would enforce it against a
// logged-in session.
import { getDb, nextId, saveDb, type StoredBudgetLine } from './local/db';
import { applyRecurringInflation, emptyPeriods, periodKeys, sumPeriods } from './lib/calc';
import {
  canApprove,
  canSeeLine,
  canSubmit,
  inGroup,
  isEditableByBranchRep,
  isFinance,
  isFinanceOrFinanceAdmin,
  isOwningBranchRep,
  nextOnApprove,
  nextOnSubmit,
  statusFor,
  userCanAct,
} from './lib/workflow';
import type {
  BudgetKind,
  BudgetLine,
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
    create: (data: { name: string; groups: Group[]; status?: 'Active' | 'Inactive' }) =>
      run(() => {
        if (!data.name.trim()) throw new Error('Name is required');
        if (data.groups.length === 0) throw new Error('Select at least one group');
        const user: User = {
          id: nextId('user'),
          name: data.name.trim(),
          groups: data.groups,
          status: data.status ?? 'Active',
          createdAt: now(),
        };
        getDb().users.push(user);
        saveDb();
        return user;
      }),
    update: (id: string, data: Partial<Pick<User, 'name' | 'groups' | 'status'>>) =>
      run(() => {
        const db = getDb();
        const user = db.users.find((u) => u.id === id);
        if (!user) throw new Error('Not found');
        if ('name' in data && data.name) user.name = data.name;
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
        if (!inGroup(user, 'Finance Admin')) throw new Error('Only Finance Admin can add a Source of Funding');
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
        if (!inGroup(user, 'Finance Admin')) throw new Error('Only Finance Admin can change a Source of Funding');
        const db = getDb();
        const source = db.fundingSources.find((f) => f.id === id);
        if (!source) throw new Error('Not found');
        source.status = status;
        saveDb();
        return source;
      }),
  },

  projects: {
    list: () => run(() => getDb().projects),
    get: (id: string) => run(() => getProjectOrThrow(id)),
    create: (data: { title: string; justification: string; additionalComments?: string }) =>
      run(() => {
        const user = requireUser();
        if (!inGroup(user, 'Branch Rep')) throw new Error('Only a Branch Rep can create a project');
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

        if (isOwningBranchRep(user, project) && (project.status === 'Draft' || project.status === 'Rejected')) {
          if ('title' in data) project.title = data.title!;
          if ('justification' in data) project.justification = data.justification!;
          if ('additionalComments' in data) project.additionalComments = data.additionalComments!;
        }
        if (finance && project.status === 'Request to Create') {
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
        project.status = 'Request to Create';
        project.updatedAt = now();
        saveDb();
        return project;
      }),
    approve: (id: string) =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(id);
        if (!isFinance(user)) throw new Error('Only Finance Officer or Finance Manager can approve project creation');
        if (project.status !== 'Request to Create') throw new Error('Project is not awaiting Finance approval');
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
        if (project.status !== 'Request to Create') throw new Error('Project is not awaiting Finance approval');
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
    create: (projectId: string, kind: BudgetKind, simulationYear: number, origin: 'new' | 'carried_forward' = 'new') =>
      run(() => {
        const user = requireUser();
        const project = getProjectOrThrow(projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can add a budget line');
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
    update: (id: string, data: Partial<BudgetLine>, simulationYear: number) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = getProjectOrThrow(line.projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can edit this line');
        if (!isEditableByBranchRep(line.step)) throw new Error('This line is not currently editable');

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
        const project = getProjectOrThrow(line.projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can delete this line');
        if (line.step !== 'BRANCH_REP_DRAFT') throw new Error('Only lines still in Draft can be deleted');
        db.budgetLines = db.budgetLines.filter((l) => l.id !== id);
        saveDb();
      }),
    submit: (id: string) =>
      run(() => {
        const user = requireUser();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = getProjectOrThrow(line.projectId);
        if (!isOwningBranchRep(user, project)) throw new Error('Only the owning Branch Rep can submit this line');
        if (!canSubmit(line.step)) throw new Error('This line cannot be submitted from its current status');
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
        const project = getProjectOrThrow(line.projectId);
        if (!canApprove(line.step)) throw new Error('This line is not awaiting approval');
        if (!userCanAct(line, user, project)) throw new Error('You are not the assigned approver for this step');
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
        const project = getProjectOrThrow(line.projectId);
        if (!userCanAct(line, user, project)) throw new Error('You are not the assigned approver for this step');
        const from = line.step;
        line.step = 'BRANCH_REP_DRAFT';
        pushHistory(line, user.id, 'return', from, line.step, note);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
  },

  teamMembers: {
    list: (projectId: string) => run(() => getDb().teamMembers.filter((m) => m.projectId === projectId)),
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
