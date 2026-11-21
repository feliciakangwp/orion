import type { BudgetLine, BudgetLineStatus, Group, User, WorkflowStep, YesNo } from '../types';

export const STEP_STATUS: Record<WorkflowStep, BudgetLineStatus> = {
  DRAFT: 'Draft',
  REVIEW: 'Review',
  CLARIFICATION_FO: 'Clarification',
  CLARIFICATION_BRANCH_REP: 'Clarification',
  CLARIFICATION_FM: 'Clarification',
  CLARIFICATION_FO_REWORK: 'Clarification',
  PENDING_APPROVAL_REVIEWER2: 'Pending Approval',
  PENDING_APPROVAL_CIO: 'Pending Approval',
  PENDING_APPROVAL_APPROVER: 'Pending Approval',
  APPROVED: 'Approved',
};

export function statusFor(line: Pick<BudgetLine, 'step'>): BudgetLineStatus {
  return STEP_STATUS[line.step];
}

export type ActorRole = 'BranchRep' | 'Reviewer1' | 'Reviewer2' | 'Approver' | 'FinOfficer' | 'FinManager' | 'CIO' | null;

export const STEP_ACTOR: Record<WorkflowStep, ActorRole> = {
  DRAFT: 'BranchRep',
  REVIEW: 'Reviewer1',
  CLARIFICATION_FO: 'FinOfficer',
  CLARIFICATION_BRANCH_REP: 'BranchRep',
  CLARIFICATION_FM: 'FinManager',
  CLARIFICATION_FO_REWORK: 'FinOfficer',
  PENDING_APPROVAL_REVIEWER2: 'Reviewer2',
  PENDING_APPROVAL_CIO: 'CIO',
  PENDING_APPROVAL_APPROVER: 'Approver',
  APPROVED: null,
};

// Every "support/approve" transition except the one branching step
// (Reviewer 2 routes to CIO for an IT project, Approver otherwise — see
// nextOnApprove below).
const APPROVE_NEXT: Partial<Record<WorkflowStep, WorkflowStep>> = {
  REVIEW: 'CLARIFICATION_FO',
  CLARIFICATION_FO: 'CLARIFICATION_FM',
  CLARIFICATION_FO_REWORK: 'CLARIFICATION_FM',
  CLARIFICATION_FM: 'PENDING_APPROVAL_REVIEWER2',
  PENDING_APPROVAL_CIO: 'APPROVED',
  PENDING_APPROVAL_APPROVER: 'APPROVED',
};

export function canApprove(step: WorkflowStep): boolean {
  return step in APPROVE_NEXT || step === 'PENDING_APPROVAL_REVIEWER2';
}

// Reviewer 2 is optional: a line with no Reviewer 2 assigned skips
// Pending Approval (Reviewer 2) entirely, going straight from
// Clarification (FM) to CIO/Approver, exactly as if it had already
// cleared that step. `reviewer2UserId` must always be passed explicitly
// (never defaulted) so a caller can't accidentally skip the step for a
// line that does have one.
export function nextOnApprove(step: WorkflowStep, itProject: YesNo | '', reviewer2UserId: string | null): WorkflowStep {
  if (step === 'CLARIFICATION_FM' && !reviewer2UserId) {
    return itProject === 'Yes' ? 'PENDING_APPROVAL_CIO' : 'PENDING_APPROVAL_APPROVER';
  }
  if (step === 'PENDING_APPROVAL_REVIEWER2') return itProject === 'Yes' ? 'PENDING_APPROVAL_CIO' : 'PENDING_APPROVAL_APPROVER';
  const next = APPROVE_NEXT[step];
  if (!next) throw new Error(`No approval transition from step ${step}`);
  return next;
}

// A Review/Clarification reject bounces back exactly one step for Branch
// Rep or Finance Officer to clarify and resubmit; a Pending Approval
// reject (Reviewer 2, CIO, or Approver) restarts the whole line from
// Branch Rep Draft.
const REJECT_NEXT: Partial<Record<WorkflowStep, WorkflowStep>> = {
  REVIEW: 'DRAFT',
  CLARIFICATION_FO: 'CLARIFICATION_BRANCH_REP',
  CLARIFICATION_FM: 'CLARIFICATION_FO_REWORK',
  PENDING_APPROVAL_REVIEWER2: 'DRAFT',
  PENDING_APPROVAL_CIO: 'DRAFT',
  PENDING_APPROVAL_APPROVER: 'DRAFT',
};

export function canReject(step: WorkflowStep): boolean {
  return step in REJECT_NEXT;
}

export function nextOnReject(step: WorkflowStep): WorkflowStep {
  const next = REJECT_NEXT[step];
  if (!next) throw new Error(`No reject transition from step ${step}`);
  return next;
}

export function isEditableByBranchRep(step: WorkflowStep): boolean {
  return step === 'DRAFT' || step === 'CLARIFICATION_BRANCH_REP';
}

export function canSubmit(step: WorkflowStep): boolean {
  return isEditableByBranchRep(step);
}

export function nextOnSubmit(step: WorkflowStep): WorkflowStep {
  if (step === 'DRAFT') return 'REVIEW';
  if (step === 'CLARIFICATION_BRANCH_REP') return 'CLARIFICATION_FO';
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

// Governs all three Finance Admin catalogs: Source of Funding, Account, and
// Cost Centre — plus the Inflation Rate table.
export function canManageFinanceAdminCatalog(user: Pick<User, 'groups'>): boolean {
  return isSuperAdmin(user) || inGroup(user, 'Finance Admin');
}

// Whether `user` can act as the owning Branch Rep on `project` — either
// they're a Super Admin (who can act as anyone, on anything), or they're
// the exact user who created it and still hold the Branch Rep group.
export function isOwningBranchRep(user: Pick<User, 'id' | 'groups'>, project: { openedByUserId: string }): boolean {
  if (isSuperAdmin(user)) return true;
  return user.id === project.openedByUserId && inGroup(user, 'Branch Rep');
}

// Whether `user` may see this Project Profile at all (in listings like
// Project Profile / Project AOR) — Finance (Officer, Manager, or Admin)
// always sees every project; everyone else only sees ones they opened as
// Branch Rep or are a team member of.
export function canSeeProject(
  project: { openedByUserId: string },
  user: User,
  teamMemberUserIds: readonly string[]
): boolean {
  if (isFinanceOrFinanceAdmin(user)) return true;
  if (isOwningBranchRep(user, project)) return true;
  return teamMemberUserIds.includes(user.id);
}

// Edits the duplicated Fin Supported record (not the original line) —
// Finance Officer/Finance Manager only.
export function canEditFinSupported(user: Pick<User, 'groups'>): boolean {
  return isSuperAdmin(user) || inGroup(user, 'Finance Officer') || inGroup(user, 'Finance Manager');
}

type ActableLine = Pick<BudgetLine, 'step' | 'reviewer1UserId' | 'reviewer2UserId' | 'approverUserId'>;

// Resolve whether a given user is permitted to act as the required actor
// role for this budget line right now. There is no department scoping:
// Reviewer1/Reviewer2/Approver are exact-user matches (whoever was picked
// into that slot); Finance Officer/Finance Manager/CIO match by group,
// project (and department) agnostic. Super Admin can act as any of these.
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
    case 'CIO':
      return inGroup(user, 'CIO');
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
