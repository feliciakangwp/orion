// Pure client-side, in-browser implementation of the ORION API.
//
// This runs entirely in localStorage (see local/db.ts) instead of calling a
// server — there is no backend to deploy. The same method shapes as the
// original fetch-based client are kept so the rest of the app (pages/tabs)
// didn't need to change; only this file's internals swap fetch calls for
// direct reads/writes against the local store, replicating the same
// permission and workflow rules a real server would enforce.
import { getDb, nextId, saveDb, type StoredBudgetLine } from './local/db';
import { applyRecurringInflation, emptyPeriods, periodKeys, sumPeriods } from './lib/calc';
import { canApprove, canSubmit, isEditableByBranchRep, nextOnApprove, nextOnSubmit, personaCanAct, statusFor } from './lib/workflow';
import {
  EXTERNAL_FUNDING_SOURCES,
  INTERNAL_FUNDING_SOURCES,
  type BudgetKind,
  type BudgetLine,
  type FundingEntry,
  type FundingSource,
  type FundingType,
  type HistoryEntry,
  type Persona,
  type Project,
  type TeamMember,
  type WorkflowStep,
} from './types';

let currentPersonaId: string | null = null;

export function setApiPersona(id: string | null) {
  currentPersonaId = id;
}

function now() {
  return new Date().toISOString();
}

function requirePersona(): Persona {
  const persona = getDb().personas.find((p) => p.id === currentPersonaId);
  if (!persona) throw new Error('Missing or unknown acting persona');
  return persona;
}

function isOwningBranchRep(persona: Pick<Persona, 'roleType' | 'dept'>, project: Pick<Project, 'openedByDept'>) {
  return persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept;
}

function isFinance(persona: Persona) {
  return persona.roleType === 'Fin Officer' || persona.roleType === 'Fin Manager';
}

function getProjectOrThrow(id: string): Project {
  const project = getDb().projects.find((p) => p.id === id);
  if (!project) throw new Error('Not found');
  return project;
}

const ALL_SOURCES: FundingSource[] = [...EXTERNAL_FUNDING_SOURCES, ...INTERNAL_FUNDING_SOURCES];

function typeOf(source: FundingSource): FundingType {
  return (EXTERNAL_FUNDING_SOURCES as readonly string[]).includes(source) ? 'External' : 'Internal';
}

function withComputed(line: StoredBudgetLine): BudgetLine {
  return { ...line, status: statusFor(line), total: sumPeriods(line.periods) };
}

function pushHistory(line: StoredBudgetLine, personaId: string, action: string, from: WorkflowStep, to: WorkflowStep, note?: string) {
  const entry: HistoryEntry = { at: now(), byPersonaId: personaId, action, fromStep: from, toStep: to, note };
  line.history.push(entry);
}

// Simulates network latency-free async calls so call sites (`await api.x()`)
// keep working unchanged from the original fetch-based client.
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
  personas: {
    list: () => run(() => getDb().personas),
  },
  projects: {
    list: () => run(() => getDb().projects),
    get: (id: string) => run(() => getProjectOrThrow(id)),
    create: (data: { title: string; justification: string; additionalComments?: string }) =>
      run(() => {
        const persona = requirePersona();
        if (persona.roleType !== 'Branch Rep') throw new Error('Only a Branch Rep can create a project');
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
          openedByPersonaId: persona.id,
          openedByDept: persona.dept!,
          simulationYear: new Date().getFullYear(),
          createdAt: now(),
          updatedAt: now(),
        };
        getDb().projects.push(project);
        saveDb();
        return project;
      }),
    update: (id: string, data: Partial<Project>) =>
      run(() => {
        const persona = requirePersona();
        const project = getProjectOrThrow(id);
        const finance = isFinance(persona);

        if (isOwningBranchRep(persona, project) && project.status === 'Draft') {
          if ('title' in data) project.title = data.title!;
          if ('justification' in data) project.justification = data.justification!;
          if ('additionalComments' in data) project.additionalComments = data.additionalComments!;
          if ('simulationYear' in data) project.simulationYear = Number(data.simulationYear);
        }
        if (finance && project.status === 'Request to Create') {
          if ('subAccount' in data) project.subAccount = data.subAccount!;
          if ('developmentCostCentre' in data) project.developmentCostCentre = data.developmentCostCentre!;
          if ('operatingCostCentre' in data) project.operatingCostCentre = data.operatingCostCentre!;
          if ('financeOfficerId' in data) project.financeOfficerId = data.financeOfficerId!;
        }
        if (isOwningBranchRep(persona, project) && 'simulationYear' in data) {
          project.simulationYear = Number(data.simulationYear);
        }
        project.updatedAt = now();
        saveDb();
        return project;
      }),
    submitRequest: (id: string) =>
      run(() => {
        const persona = requirePersona();
        const project = getProjectOrThrow(id);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can submit this request');
        if (project.status !== 'Draft') throw new Error('Project is not in Draft status');
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
        const persona = requirePersona();
        const project = getProjectOrThrow(id);
        if (!isFinance(persona)) throw new Error('Only Finance can approve project creation');
        if (project.status !== 'Request to Create') throw new Error('Project is not awaiting Finance approval');
        if (!project.subAccount || !project.developmentCostCentre || !project.operatingCostCentre || !project.financeOfficerId) {
          throw new Error('Sub Account, Development Cost Centre, Operating Cost Centre and Finance Officer must be filled before approving');
        }
        project.status = 'Active';
        project.updatedAt = now();
        saveDb();
        return project;
      }),
  },
  funding: {
    list: (projectId: string) => run(() => getDb().fundingEntries.filter((f) => f.projectId === projectId)),
    create: (projectId: string, sourceOfFunding: string) =>
      run(() => {
        const persona = requirePersona();
        const project = getProjectOrThrow(projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can add a funding source');
        if (!ALL_SOURCES.includes(sourceOfFunding as FundingSource)) throw new Error('Invalid Source of Funding');
        const entry: FundingEntry = {
          id: nextId('funding'),
          projectId: project.id,
          fundingPotId: '',
          sourceOfFunding: sourceOfFunding as FundingSource,
          fundingType: typeOf(sourceOfFunding as FundingSource),
          status: 'Pipeline',
          createdAt: now(),
          updatedAt: now(),
        };
        getDb().fundingEntries.push(entry);
        saveDb();
        return entry;
      }),
    update: (id: string, data: Partial<FundingEntry>) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const entry = db.fundingEntries.find((f) => f.id === id);
        if (!entry) throw new Error('Not found');
        const project = getProjectOrThrow(entry.projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can edit this entry');
        if (entry.status !== 'Pipeline') throw new Error('Only Pipeline entries can be edited');
        if (data.sourceOfFunding) {
          if (!ALL_SOURCES.includes(data.sourceOfFunding)) throw new Error('Invalid Source of Funding');
          if (data.sourceOfFunding === 'Mainstreaming' && entry.sourceOfFunding !== 'Mainstreaming') {
            throw new Error('Cannot change a funding source back to Mainstreaming');
          }
          entry.sourceOfFunding = data.sourceOfFunding;
          entry.fundingType = typeOf(data.sourceOfFunding);
        }
        entry.updatedAt = now();
        saveDb();
        return entry;
      }),
    approve: (id: string, fundingPotId: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const entry = db.fundingEntries.find((f) => f.id === id);
        if (!entry) throw new Error('Not found');
        if (!isFinance(persona)) throw new Error('Only Fin Officer or Fin Manager can approve funding');
        if (entry.sourceOfFunding === 'Mainstreaming') {
          throw new Error('Mainstreaming entries remain in Pipeline and cannot be approved');
        }
        if (entry.status !== 'Pipeline') throw new Error('Entry is not Pipeline');
        if (!fundingPotId) throw new Error('Funding Pot ID is required to approve');
        entry.fundingPotId = fundingPotId;
        entry.status = 'Approved';
        entry.updatedAt = now();
        saveDb();
        return entry;
      }),
    remove: (id: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const entry = db.fundingEntries.find((f) => f.id === id);
        if (!entry) throw new Error('Not found');
        const project = getProjectOrThrow(entry.projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can remove this entry');
        if (entry.status !== 'Pipeline') throw new Error('Only Pipeline entries can be removed');
        db.fundingEntries = db.fundingEntries.filter((f) => f.id !== id);
        saveDb();
      }),
  },
  budgetLines: {
    list: (projectId: string, kind: BudgetKind) =>
      run(() =>
        getDb()
          .budgetLines.filter((l) => l.projectId === projectId && l.kind === kind)
          .map(withComputed)
      ),
    create: (projectId: string, kind: BudgetKind, origin: 'new' | 'carried_forward' = 'new') =>
      run(() => {
        const persona = requirePersona();
        const project = getProjectOrThrow(projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can add a budget line');
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
          periods: emptyPeriods(kind, project.simulationYear),
          assignedToPersonaId: persona.id,
          reviewer1PersonaId: null,
          reviewer2PersonaId: null,
          approverPersonaId: null,
          financeOfficerPersonaId: null,
          history: [],
          createdAt: now(),
          updatedAt: now(),
        };
        getDb().budgetLines.push(line);
        saveDb();
        return withComputed(line);
      }),
    update: (id: string, data: Partial<BudgetLine>) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = getProjectOrThrow(line.projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can edit this line');
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
          'reviewer1PersonaId',
          'reviewer2PersonaId',
          'approverPersonaId',
          'financeOfficerPersonaId',
        ] as const;
        for (const field of EDITABLE_FIELDS) {
          if (field in data) (line as any)[field] = (data as any)[field];
        }
        if (!line.itProject || line.itProject !== 'Yes') {
          line.ictExp = '';
          line.buildOrBuy = '';
        }

        const keys = periodKeys(line.kind, project.simulationYear);
        if ('periods' in data) {
          const incoming = data.periods as Record<string, number>;
          if (line.recurring === 'Yes') {
            const baseAmount = Number(incoming[keys[0]] ?? line.periods[keys[0]] ?? 0);
            line.periods = applyRecurringInflation(line.kind, project.simulationYear, line.recurring, line.itProject, baseAmount);
          } else {
            line.periods = { ...emptyPeriods(line.kind, project.simulationYear), ...line.periods, ...incoming };
          }
        } else if ('recurring' in data || 'itProject' in data) {
          if (line.recurring === 'Yes') {
            const baseAmount = Number(line.periods[keys[0]] ?? 0);
            line.periods = applyRecurringInflation(line.kind, project.simulationYear, line.recurring, line.itProject, baseAmount);
          }
        }

        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    remove: (id: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = getProjectOrThrow(line.projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can delete this line');
        if (line.step !== 'BRANCH_REP_DRAFT') throw new Error('Only lines still in Draft can be deleted');
        db.budgetLines = db.budgetLines.filter((l) => l.id !== id);
        saveDb();
      }),
    submit: (id: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = getProjectOrThrow(line.projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can submit this line');
        if (!canSubmit(line.step)) throw new Error('This line cannot be submitted from its current status');
        if (!line.reviewer1PersonaId) throw new Error('Reviewer 1 must be selected before submitting');
        if (line.step === 'BRANCH_REP_READY' && (!line.reviewer2PersonaId || !line.approverPersonaId)) {
          throw new Error('Reviewer 1, Reviewer 2 and Approver must all be selected before submitting for final approval');
        }
        const from = line.step;
        line.step = nextOnSubmit(line.step);
        pushHistory(line, persona.id, 'submit', from, line.step);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    approve: (id: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = getProjectOrThrow(line.projectId);
        if (!canApprove(line.step)) throw new Error('This line is not awaiting approval');
        if (!personaCanAct(line, persona, project.openedByDept)) throw new Error('You are not the assigned approver for this step');
        if (line.step === 'FIN_OFFICER_R1' || line.step === 'FIN_OFFICER_R2') {
          line.financeOfficerPersonaId = persona.id;
        }
        const from = line.step;
        line.step = nextOnApprove(line.step);
        pushHistory(line, persona.id, 'approve', from, line.step);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
    return: (id: string, note?: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const line = db.budgetLines.find((l) => l.id === id);
        if (!line) throw new Error('Not found');
        const project = getProjectOrThrow(line.projectId);
        if (!personaCanAct(line, persona, project.openedByDept)) throw new Error('You are not the assigned approver for this step');
        const from = line.step;
        line.step = 'BRANCH_REP_DRAFT';
        pushHistory(line, persona.id, 'return', from, line.step, note);
        line.updatedAt = now();
        saveDb();
        return withComputed(line);
      }),
  },
  teamMembers: {
    list: (projectId: string) => run(() => getDb().teamMembers.filter((m) => m.projectId === projectId)),
    create: (projectId: string, personaId: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const project = getProjectOrThrow(projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can add team members');
        if (!db.personas.some((p) => p.id === personaId)) throw new Error('Invalid persona');
        if (db.teamMembers.some((m) => m.projectId === project.id && m.personaId === personaId)) {
          throw new Error('This person is already a team member');
        }
        const member: TeamMember = { id: nextId('member'), projectId: project.id, personaId, createdAt: now() };
        db.teamMembers.push(member);
        saveDb();
        return member;
      }),
    remove: (id: string) =>
      run(() => {
        const persona = requirePersona();
        const db = getDb();
        const member = db.teamMembers.find((m) => m.id === id);
        if (!member) throw new Error('Not found');
        const project = getProjectOrThrow(member.projectId);
        if (!isOwningBranchRep(persona, project)) throw new Error('Only the owning Branch Rep can remove team members');
        db.teamMembers = db.teamMembers.filter((m) => m.id !== id);
        saveDb();
      }),
  },
};
