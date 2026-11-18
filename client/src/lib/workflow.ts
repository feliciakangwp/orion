import type { BudgetLine, BudgetLineStatus, Group, User, WorkflowStep } from '../types';

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

export function inGroup(user: Pick<User, 'groups'>, group: Group): boolean {
  return user.groups.includes(group);
}

// Super Admin can do anything anyone else can do, anywhere in the app — it's
// an unconditional override, folded directly into every permission
// predicate below rather than checked ad hoc at each call site, so nothing
// can accidentally end up gating Super Admin out.
export function isSuperAdmin(user: Pick<User, 'groups'>): boolean {
  return inGroup(user, 'Super Admin');
}

export function isFinance(user: Pick<User, 'groups'>): boolean {
  return isSuperAdmin(user) || inGroup(user, 'Finance Officer') || inGroup(user, 'Finance Manager');
}

// Finance Admin is treated as able to act anywhere Finance can for budget
// line approval/visibility purposes (see canSeeLine), since it's the more
// senior finance role managing the funding catalog itself.
export function isFinanceOrFinanceAdmin(user: Pick<User, 'groups'>): boolean {
  return isFinance(user) || inGroup(user, 'Finance Admin');
}

export function canCreateProject(user: Pick<User, 'groups'>): boolean {
  return isSuperAdmin(user) || inGroup(user, 'Branch Rep');
}

export function canManageFundingCatalog(user: Pick<User, 'groups'>): boolean {
  return isSuperAdmin(user) || inGroup(user, 'Finance Admin');
}

// Whether `user` can act as the owning Branch Rep on `project` — either
// they're a Super Admin (who can act as anyone, on anything), or they're
// the exact user who created it and still hold the Branch Rep group.
export function isOwningBranchRep(user: Pick<User, 'id' | 'groups'>, project: { openedByUserId: string }): boolean {
  if (isSuperAdmin(user)) return true;
  return user.id === project.openedByUserId && inGroup(user, 'Branch Rep');
}

type ActableLine = Pick<BudgetLine, 'step' | 'reviewer1UserId' | 'reviewer2UserId' | 'approverUserId'>;

// Resolve whether a given user is permitted to act as the required actor
// role for this budget line right now. There is no department scoping:
// Reviewer1/Reviewer2/Approver are exact-user matches (whoever was picked
// into that slot); Finance Officer/Finance Manager match by group, project
// (and department) agnostic. Super Admin can act as any of these.
export function userCanAct(line: ActableLine, user: User, project: { openedByUserId: string }): boolean {
  if (isSuperAdmin(user)) return true;
  const role = STEP_ACTOR[line.step];
  if (!role) return false;
  switch (role) {
    case 'BranchRep':
      return isOwningBranchRep(user, project);
    case 'Reviewer1':
      return !!line.reviewer1UserId && user.id === line.reviewer1UserId;
    case 'Reviewer2':
      return !!line.reviewer2UserId && user.id === line.reviewer2UserId;
    case 'Approver':
      return !!line.approverUserId && user.id === line.approverUserId;
    case 'FinOfficer':
      return inGroup(user, 'Finance Officer');
    case 'FinManager':
      return inGroup(user, 'Finance Manager');
    default:
      return false;
  }
}

type TaggableLine = Pick<
  BudgetLine,
  'assignedToUserId' | 'reviewer1UserId' | 'reviewer2UserId' | 'approverUserId' | 'financeOfficerUserId'
>;

// Line-level visibility: Finance (Officer/Manager/Admin) and Super Admin see
// every line. Everyone else only sees a line if they're tagged on it
// somewhere (creator, reviewer, approver, or finance officer) or they're a
// team member of the project.
export function canSeeLine(line: TaggableLine, user: User, teamMemberUserIds: readonly string[]): boolean {
  if (isFinanceOrFinanceAdmin(user)) return true;
  const taggedIds = [
    line.assignedToUserId,
    line.reviewer1UserId,
    line.reviewer2UserId,
    line.approverUserId,
    line.financeOfficerUserId,
  ];
  if (taggedIds.includes(user.id)) return true;
  return teamMemberUserIds.includes(user.id);
}
