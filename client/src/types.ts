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
  email: string;
  groups: Group[];
  status: UserStatus;
  createdAt: string;
}

// ---------- Project Profile ----------

// "Pending" is what was briefly called "Request to Create" — awaiting
// Finance approval. Branch Rep can keep editing a project while Pending.
export type ProjectStatus = 'Draft' | 'Pending' | 'Active' | 'Rejected';

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
// always derived live from the referenced catalog entry, not duplicated
// here. The pot details (Pot ID, Supported Fund amount, Start/Expiry Date,
// Development/Operating Cost Centre) only apply to an External entry —
// they're what Mainstreaming (see lib/mainstreaming.ts) is computed from.
export interface FundingEntry {
  id: string;
  projectId: string;
  fundingSourceId: string;
  fundingPotId: string;
  supportedFund: number;
  fundStartDate: string | null;
  fundExpiryDate: string | null;
  developmentCostCentre: string;
  operatingCostCentre: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Account catalog (Finance Admin) ----------
// A 5-level account code hierarchy (e.g. L1 "5000 Development Expenditure"
// down to L5 "511604 ICT Consultation Services") — the level-above code is
// always a numeric prefix of the level-below one, so the hierarchy is
// implicit in the codes rather than a stored parent link. Only Level 5
// (leaf) entries are offered on a budget line's Account dropdown.

export type AccountLevel = 1 | 2 | 3 | 4 | 5;

export interface AccountCode {
  id: string;
  code: string;
  description: string;
  level: AccountLevel;
  opsOrDev: 'Operating' | 'Development' | '';
  status: CatalogStatus;
  createdAt: string;
}

// ---------- Cost Centre catalog (Finance Admin) ----------

export const COST_CENTRE_TYPES = ['NO01 Administration', 'NO02 Revenue', 'NO03 Preventive'] as const;
export type CostCentreType = (typeof COST_CENTRE_TYPES)[number];
export type ExpenditureNature = 'Development' | 'Operating';

export interface CostCentreCode {
  id: string;
  code: string;
  name: string;
  type: CostCentreType;
  natureOfExpenditure: ExpenditureNature;
  financeOfficerUserId: string | null;
  createdAt: string;
}

export type BudgetKind = 'MTP' | 'BLOCK' | 'RB' | 'OB';

// ---------- Budget Period (Finance Admin) ----------
// A budgeting exercise/cycle: Medium Term Projection (kind MTP), Annual
// Budget (kinds RB + OB together — Original and Revised are both part of
// the same annual cycle), and Block Budget (kind BLOCK). Only one of the
// three can be active (not Draft) at a time.

export const BUDGET_EXERCISE_TYPES = ['MTP', 'ANNUAL', 'BLOCK'] as const;
export type BudgetExerciseType = (typeof BUDGET_EXERCISE_TYPES)[number];

// Stored state machine: Draft (never opened, dates still editable) -> Open
// (Finance Admin opened it; start date now locked) -> Locked (Finance Admin
// explicitly "Closed and Lock"). "Closed for Submission" is not its own
// stored state — it's the Open state once `endDate` has passed (see
// `effectiveBudgetPeriodStatus` in lib/budgetPeriod.ts), so reopening a
// Locked period naturally lands back in whichever of Open/Closed for
// Submission the date already implies.
export type BudgetPeriodStoredStatus = 'Draft' | 'Open' | 'Locked';

// The four states shown in the UI and used for permission checks.
export type BudgetPeriodStatus = 'Draft' | 'Open' | 'Closed for Submission' | 'Closed and Locked';

export interface BudgetPeriod {
  id: string;
  type: BudgetExerciseType;
  status: BudgetPeriodStoredStatus;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
}

// A single linear chain (no more two-round split): Branch Rep drafts and
// submits -> Reviewer 1 -> Finance Officer -> Finance Manager -> Reviewer 2
// -> (CIO if an IT project, else Approver) -> Approved. Any Clarification
// reject bounces back exactly one step for Branch Rep/Finance Officer to
// clarify and resubmit; any Pending Approval reject restarts the whole line
// from Branch Rep Draft.
export type WorkflowStep =
  | 'DRAFT'
  | 'REVIEW'
  | 'CLARIFICATION_FO'
  | 'CLARIFICATION_BRANCH_REP'
  | 'CLARIFICATION_FM'
  | 'CLARIFICATION_FO_REWORK'
  | 'PENDING_APPROVAL_REVIEWER2'
  | 'PENDING_APPROVAL_CIO'
  | 'PENDING_APPROVAL_APPROVER'
  | 'APPROVED';

export type BudgetLineStatus = 'Draft' | 'Review' | 'Clarification' | 'Pending Approval' | 'Approved';

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
  // null for an "ad hoc" MTP line not tied to any Project Profile — created
  // from Medium Term Projection > Budget Line Item. It can be attached to a
  // project later (and detached again) via its Project Title cell there.
  projectId: string | null;
  kind: BudgetKind;
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
  // MTP-only (see lib/variance.ts): each period's value as of the last
  // rollover/creation, frozen until the next one — any edit a Branch Rep
  // makes afterward is what MTP Variance compares against. A brand-new
  // line (no Project Profile history) gets an all-zero snapshot, so any
  // nonzero figure they enter is automatically a 100%+ variance.
  previousPeriods: Record<string, number>;
  // FY key -> justification text. Only ever meaningfully required for the
  // earliest FY whose variance currently exceeds the Inflation Rate
  // threshold (see lib/variance.ts) — entries for other years are kept
  // but ignored if the required year shifts.
  justifications: Record<string, string>;
  assignedToUserId: string;
  reviewer1UserId: string | null;
  reviewer2UserId: string | null;
  approverUserId: string | null;
  financeOfficerUserId: string | null;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// ---------- Inflation Rate (Finance Admin) ----------
// Drives both the recurring-line auto-growth on MTP/Block lines and the
// MTP Variance justification threshold (a year's change vs last FY is
// flagged once it exceeds the matching rate).

export type InflationItem = 'Non IT Item' | 'IT Item';

export interface InflationRate {
  id: string;
  item: InflationItem;
  value: number; // a percentage, e.g. 3 means 3%
  updatedAt: string;
}

// ---------- Fin Supported (duplicated on final approval) ----------
// A snapshot taken the moment a line reaches APPROVED: its own record,
// with periods rounded to the nearest 100 (amounts under 100 are left
// alone). Editing it (Finance Officer/Finance Manager only) never touches
// the original BudgetLine, which stays exactly as it was approved.

export interface FinSupportedLine {
  id: string;
  sourceBudgetLineId: string;
  // The original line's own createdAt — governs "line 1 to 10" ordering
  // for the Mainstreaming waterfall (see lib/mainstreaming.ts), which is
  // about creation order, not approval order.
  sourceLineCreatedAt: string;
  projectId: string | null;
  kind: BudgetKind;
  description: string;
  account: string;
  subAcct: string;
  opsOrDev: OpsOrDev | '';
  costCentre: string;
  fundingEntryId: string | null;
  itProject: YesNo | '';
  periods: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

// Computed (never stored) at read time, once the project's MTP budget
// period is Closed for Submission or Closed and Locked — see
// `lib/mainstreaming.ts` and `api.ts`'s `finSupportedLines.list`.
export interface FinSupportedLineWithMainstreaming extends FinSupportedLine {
  mainstreamingPeriods: Record<string, number> | null;
}

// ---------- Team Members ----------

export interface TeamMember {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
}
