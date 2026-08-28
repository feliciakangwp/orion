import type { BudgetLine, BudgetLineStatus, Persona, WorkflowStep } from '../types';

export const STEP_STATUS: Record<WorkflowStep, (origin: BudgetLine['origin']) => BudgetLineStatus> = {
  BRANCH_REP_DRAFT: (origin) => (origin === 'new' ? 'New' : 'Draft'),
  REVIEWER1_R1: () => 'Pending Review',
  FIN_OFFICER_R1: () => 'Clarification',
  FIN_MANAGER_R1: () => 'Clarification',
  BRANCH_REP_READY: () => 'Ready for Approval',
  REVIEWER1_R2: () => 'Pending Approval',
  REVIEWER2_R2: () => 'Pending Approval',
  APPROVER_R2: () => 'Pending Approval',
  FIN_OFFICER_R2: () => 'Pending Approval',
  FIN_MANAGER_R2: () => 'Pending Approval',
  DONE: () => 'Fin Supported',
};

export function statusFor(line: Pick<BudgetLine, 'step' | 'origin'>): BudgetLineStatus {
  return STEP_STATUS[line.step](line.origin);
}

export type ActorRole = 'BranchRep' | 'Reviewer1' | 'Reviewer2' | 'Approver' | 'FinOfficer' | 'FinManager' | null;

export const STEP_ACTOR: Record<WorkflowStep, ActorRole> = {
  BRANCH_REP_DRAFT: 'BranchRep',
  REVIEWER1_R1: 'Reviewer1',
  FIN_OFFICER_R1: 'FinOfficer',
  FIN_MANAGER_R1: 'FinManager',
  BRANCH_REP_READY: 'BranchRep',
  REVIEWER1_R2: 'Reviewer1',
  REVIEWER2_R2: 'Reviewer2',
  APPROVER_R2: 'Approver',
  FIN_OFFICER_R2: 'FinOfficer',
  FIN_MANAGER_R2: 'FinManager',
  DONE: null,
};

const APPROVE_NEXT: Partial<Record<WorkflowStep, WorkflowStep>> = {
  REVIEWER1_R1: 'FIN_OFFICER_R1',
  FIN_OFFICER_R1: 'FIN_MANAGER_R1',
  FIN_MANAGER_R1: 'BRANCH_REP_READY',
  REVIEWER1_R2: 'REVIEWER2_R2',
  REVIEWER2_R2: 'APPROVER_R2',
  APPROVER_R2: 'FIN_OFFICER_R2',
  FIN_OFFICER_R2: 'FIN_MANAGER_R2',
  FIN_MANAGER_R2: 'DONE',
};

export function canApprove(step: WorkflowStep): boolean {
  return step in APPROVE_NEXT;
}

export function nextOnApprove(step: WorkflowStep): WorkflowStep {
  const next = APPROVE_NEXT[step];
  if (!next) throw new Error(`No approval transition from step ${step}`);
  return next;
}

export function isEditableByBranchRep(step: WorkflowStep): boolean {
  return step === 'BRANCH_REP_DRAFT' || step === 'BRANCH_REP_READY';
}

export function canSubmit(step: WorkflowStep): boolean {
  return isEditableByBranchRep(step);
}

export function nextOnSubmit(step: WorkflowStep): WorkflowStep {
  if (step === 'BRANCH_REP_DRAFT') return 'REVIEWER1_R1';
  if (step === 'BRANCH_REP_READY') return 'REVIEWER1_R2';
  throw new Error(`No submit transition from step ${step}`);
}

type ActableLine = Pick<BudgetLine, 'step' | 'reviewer1PersonaId' | 'reviewer2PersonaId' | 'approverPersonaId'>;

export function personaCanAct(line: ActableLine, persona: Persona, projectOpenedByDept: string): boolean {
  const role = STEP_ACTOR[line.step];
  if (!role) return false;
  switch (role) {
    case 'BranchRep':
      return persona.roleType === 'Branch Rep' && persona.dept === projectOpenedByDept;
    case 'Reviewer1':
      return !!line.reviewer1PersonaId && persona.id === line.reviewer1PersonaId;
    case 'Reviewer2':
      return !!line.reviewer2PersonaId && persona.id === line.reviewer2PersonaId;
    case 'Approver':
      return !!line.approverPersonaId && persona.id === line.approverPersonaId;
    case 'FinOfficer':
      return persona.roleType === 'Fin Officer';
    case 'FinManager':
      return persona.roleType === 'Fin Manager';
    default:
      return false;
  }
}

type TaggableLine = Pick<
  BudgetLine,
  'assignedToPersonaId' | 'reviewer1PersonaId' | 'reviewer2PersonaId' | 'approverPersonaId' | 'financeOfficerPersonaId'
>;

// Line-level visibility: Finance sees every line. Everyone else only sees a
// line if they're tagged on it somewhere (creator, reviewer, approver, or
// finance officer) or they're a team member of the project — being of the
// same department, or even the owning Branch Rep's own dept hierarchy, is
// not by itself enough.
export function canSeeLine(line: TaggableLine, persona: Persona, teamMemberPersonaIds: readonly string[]): boolean {
  if (persona.roleType === 'Fin Officer' || persona.roleType === 'Fin Manager') return true;
  const taggedIds = [
    line.assignedToPersonaId,
    line.reviewer1PersonaId,
    line.reviewer2PersonaId,
    line.approverPersonaId,
    line.financeOfficerPersonaId,
  ];
  if (taggedIds.includes(persona.id)) return true;
  return teamMemberPersonaIds.includes(persona.id);
}
