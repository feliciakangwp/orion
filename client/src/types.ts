// ---------- Users & Groups ----------
// A User is a named person who can belong to multiple Groups at once; access
// throughout the app is granted by group membership, not by a single fixed
// role. There is no department concept — a user with, say, "DY Head" can
// review any project, not just ones from a particular department.

export const GROUPS = [
  'Super Admin',
  'Branch Rep',
  'DY Head',
  'Head',
  'SMGT',
  'CIO',
  'HR',
  'Finance Officer',
  'Finance Manager',
  'Finance Admin',
] as const;
export type Group = (typeof GROUPS)[number];

export type UserStatus = 'Active' | 'Inactive';

export interface User {
  id: string;
  name: string;
  groups: Group[];
  status: UserStatus;
  createdAt: string;
}

// ---------- Project Profile ----------

export type ProjectStatus = 'Draft' | 'Request to Create' | 'Active' | 'Rejected';

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  justification: string;
  additionalComments: string;
  // Filled in by Finance once routed to them
  subAccount: string;
  developmentCostCentre: string;
  operatingCostCentre: string;
  financeOfficerId: string | null; // User id (Finance Officer or Finance Manager)
  // Ownership
  openedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Source of Funding catalog (Finance Admin) ----------
// A Finance-Admin-managed master list of named funding sources. Each name
// typically exists as a Pipeline/Approved pair (e.g. "Within the Block (P)"
// and "Within the Block") — Branch Reps pick a Pipeline entry for a project;
// Finance Officer/Finance Admin later swap it to the matching Approved entry
// as the approval action itself, rather than a separate "approve" step.

export type FundingMaturity = 'Pipeline' | 'Approved';
export type FundingCategory = 'Internal' | 'External';
export type CatalogStatus = 'Active' | 'Inactive';

export interface FundingSource {
  id: string;
  name: string;
  maturity: FundingMaturity;
  category: FundingCategory;
  status: CatalogStatus;
  createdAt: string;
}

// A project's chosen funding source. Its "type"/"status" for display are
// always derived live from the referenced catalog entry, not duplicated here.
export interface FundingEntry {
  id: string;
  projectId: string;
  fundingSourceId: string;
  createdAt: string;
  updatedAt: string;
}

export type BudgetKind = 'MTE' | 'BLOCK' | 'RB' | 'OB';

export type WorkflowStep =
  | 'BRANCH_REP_DRAFT'
  | 'REVIEWER1_R1'
  | 'FIN_OFFICER_R1'
  | 'FIN_MANAGER_R1'
  | 'BRANCH_REP_READY'
  | 'REVIEWER1_R2'
  | 'REVIEWER2_R2'
  | 'APPROVER_R2'
  | 'FIN_OFFICER_R2'
  | 'FIN_MANAGER_R2'
  | 'DONE';

export type BudgetLineStatus =
  | 'New'
  | 'Draft'
  | 'Pending Review'
  | 'Clarification'
  | 'Ready for Approval'
  | 'Pending Approval'
  | 'Fin Supported';

export type OpsOrDev = 'Ops' | 'Dev';
export type YesNo = 'Yes' | 'No';
export type BuildOrBuy = 'Build' | 'Buy';
export type BudgetType = 'RB' | 'OB';

export interface HistoryEntry {
  at: string;
  byUserId: string;
  action: string;
  fromStep: WorkflowStep;
  toStep: WorkflowStep;
  note?: string;
}

export interface BudgetLine {
  id: string;
  projectId: string;
  kind: BudgetKind;
  origin: 'new' | 'carried_forward';
  step: WorkflowStep;
  status: BudgetLineStatus; // computed
  description: string;
  opsOrDev: OpsOrDev | '';
  account: string;
  subAcct: string;
  fundingEntryId: string | null;
  recurring: YesNo | '';
  costCentre: string;
  itProject: YesNo | '';
  ictExp: string;
  buildOrBuy: BuildOrBuy | '';
  basis: string;
  budgetType: BudgetType | null;
  periods: Record<string, number>;
  total: number; // computed
  assignedToUserId: string;
  reviewer1UserId: string | null;
  reviewer2UserId: string | null;
  approverUserId: string | null;
  financeOfficerUserId: string | null;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// ---------- Team Members ----------

export interface TeamMember {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
}
