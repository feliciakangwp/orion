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
  // Filled in by Finance once routed to them. Picked from the Sub Account
  // catalog (Finance Admin) as "`${code} ${name}`" — each project gets a
  // unique one, which then auto-populates a new budget line's own Sub
  // Account the moment it's created from one of this project's tabs.
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

// ---------- ICT Expenditure Category catalog (Finance Admin) ----------
// Just a named list — populates a budget line's ICT Expenditure Category
// dropdown (shown only when "Is it an IT Project?" is Yes).

export interface IctExpenditureCategory {
  id: string;
  name: string;
  createdAt: string;
}

// ---------- Division catalog (Finance Admin) ----------
// A plain named list of divisions — Finance Admin maintains it, but
// nothing else in the app references it yet.

export interface Division {
  id: string;
  name: string;
  createdAt: string;
}

// ---------- Sub Account catalog (Finance Admin) ----------
// Each Project Profile is assigned a unique Sub Account (see
// `Project.subAccount`), which then auto-populates a budget line's own
// Sub Account field the moment it's created from one of that project's
// tabs. `code` always starts with Q followed by 4 digits (e.g. "Q1095").

export interface SubAccountCode {
  id: string;
  code: string;
  name: string;
  status: CatalogStatus;
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
  // BLOCK only: the calendar year whose FY is the first of Block Budget's
  // 5-FY window (e.g. 2028 means the window is FY28-FY32) — independent of
  // this period's own Start Date (which only governs the exercise's own
  // workflow timing, same as every other exercise). Revised/Original
  // Budget's reference years for a Block Budget line are always 2 and 1
  // years before this one. Null until Finance Admin sets it, which must
  // happen before Block Budget can be opened.
  blockBudgetStartYear: number | null;
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
  // MTP: each period's value as of the last rollover/creation, frozen
  // until the next one — any edit a Branch Rep makes afterward is what
  // MTP Variance compares against. RB: the Original Budget line's periods
  // at the moment this Revised Budget line was duplicated from it — its
  // *sum* is "Approved Original Budget" (see lib/variance.ts). OB: unused
  // (always all-zero — "no comparison"). A brand-new line (no history)
  // gets an all-zero snapshot, so any nonzero figure is automatically a
  // full variance.
  previousPeriods: Record<string, number>;
  // MTP only: FY key -> justification text. Only ever meaningfully
  // required for the earliest FY whose variance currently exceeds the
  // Inflation Rate threshold (see lib/variance.ts) — entries for other
  // years are kept but ignored if the required year shifts.
  justifications: Record<string, string>;
  // RB only: a single justification for the line's total variance
  // (Approved Original Budget vs Total Budget Requested) — unlike MTP's
  // per-FY justifications, Annual Budget variance is one total number.
  justificationForVariance: string;
  // RB/OB only: the Financial Year this submission belongs to (e.g. 2027
  // for "FY27"), set from the Annual Budget Period's Start Date at the
  // moment the line is created or rolled forward. Null for MTP/Block.
  submissionYear: number | null;
  // RB/OB/BLOCK only: the MTP line this one was generated from/kept in
  // sync with across rollovers (see rollAnnualBudgetForward and
  // rollBlockBudgetForward in api.ts) — null for a line added by hand,
  // with no MTP counterpart. Also how a BLOCK line looks up its
  // Revised/Original Budget reference totals (see
  // BlockBudgetLineWithReferences) — all three kinds sharing the same MTP
  // line share this same id.
  sourceMtpLineId: string | null;
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

// Computed (never stored) at read time for a BLOCK-kind line: the totals
// of its linked Revised/Original Budget lines (same `sourceMtpLineId`,
// matched to the Block Budget Start Year's -2/-1 reference FYs) — shown
// as read-only reference columns on Block Budget Line Item, never part of
// the line's own `total` (which stays just its 5 Block FYs). Null when no
// such line exists (e.g. no Annual Budget cycle has run for that FY yet).
export interface BlockBudgetLineWithReferences extends BudgetLine {
  revisedBudgetTotal: number | null;
  originalBudgetTotal: number | null;
}

// ---------- Team Members ----------

export interface TeamMember {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
}
