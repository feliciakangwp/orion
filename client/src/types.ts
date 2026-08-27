export const DEPTS = ['PSB', 'PCB', 'SIB', 'ACB', 'FIN'] as const;
export type Dept = (typeof DEPTS)[number];

export const DEPT_ROLE_TYPES = ['Branch Rep', 'DY Head', 'Head', 'SMGT'] as const;
export type DeptRoleType = (typeof DEPT_ROLE_TYPES)[number];
export type FinRoleType = 'Fin Officer' | 'Fin Manager';
export type RoleType = DeptRoleType | FinRoleType;

export interface Persona {
  id: string;
  name: string;
  roleType: RoleType;
  dept: Dept | null;
}

export type ProjectStatus = 'Draft' | 'Request to Create' | 'Active';

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  justification: string;
  additionalComments: string;
  subAccount: string;
  developmentCostCentre: string;
  operatingCostCentre: string;
  financeOfficerId: string | null;
  openedByPersonaId: string;
  openedByDept: Dept;
  simulationYear: number;
  createdAt: string;
  updatedAt: string;
}

export const EXTERNAL_FUNDING_SOURCES = ['ATB', 'RF', 'CDB', 'IB'] as const;
export const INTERNAL_FUNDING_SOURCES = ['WTB', 'Mainstreaming'] as const;
export type FundingSource =
  | (typeof EXTERNAL_FUNDING_SOURCES)[number]
  | (typeof INTERNAL_FUNDING_SOURCES)[number];
export type FundingType = 'External' | 'Internal';
export type FundingStatus = 'Pipeline' | 'Approved';

export interface FundingEntry {
  id: string;
  projectId: string;
  fundingPotId: string;
  sourceOfFunding: FundingSource;
  fundingType: FundingType;
  status: FundingStatus;
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
  byPersonaId: string;
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
  status: BudgetLineStatus; // computed by server
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
  total: number; // computed by server
  assignedToPersonaId: string;
  reviewer1PersonaId: string | null;
  reviewer2PersonaId: string | null;
  approverPersonaId: string | null;
  financeOfficerPersonaId: string | null;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  projectId: string;
  personaId: string;
  createdAt: string;
}
