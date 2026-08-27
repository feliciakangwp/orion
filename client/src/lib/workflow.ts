import type { BudgetLine, Persona, WorkflowStep } from '../types';

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

export function isEditableByBranchRep(step: WorkflowStep): boolean {
  return step === 'BRANCH_REP_DRAFT' || step === 'BRANCH_REP_READY';
}

export function canSubmit(step: WorkflowStep): boolean {
  return isEditableByBranchRep(step);
}

export function canApprove(step: WorkflowStep): boolean {
  return step !== 'BRANCH_REP_DRAFT' && step !== 'BRANCH_REP_READY' && step !== 'DONE';
}

export function personaCanAct(line: BudgetLine, persona: Persona, projectOpenedByDept: string): boolean {
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
