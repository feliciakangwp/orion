import { BUDGET_EXERCISE_TYPES, GROUPS } from '../types';
import type {
  AccountCode,
  BudgetExerciseType,
  BudgetLine,
  BudgetPeriod,
  CostCentreCode,
  FinSupportedLine,
  FundingEntry,
  FundingSource,
  Group,
  InflationItem,
  InflationRate,
  TeamMember,
  Project,
  User,
} from '../types';

// status/total are always derived (see lib/workflow.ts statusFor / lib/calc.ts
// sumPeriods) rather than stored.
export type StoredBudgetLine = Omit<BudgetLine, 'status' | 'total'>;

export interface DbShape {
  users: User[];
  fundingSources: FundingSource[];
  accountCodes: AccountCode[];
  costCentres: CostCentreCode[];
  inflationRates: InflationRate[];
  projects: Project[];
  fundingEntries: FundingEntry[];
  budgetLines: StoredBudgetLine[];
  finSupportedLines: FinSupportedLine[];
  teamMembers: TeamMember[];
  budgetPeriods: BudgetPeriod[];
  seq: number;
}

// Bumped again from orion.db.v4: new entities (InflationRate,
// FinSupportedLine) and a reworked BudgetLine workflow/shape (new
// WorkflowStep values, previousPeriods, justifications, origin dropped) —
// this is a clean slate with a different shape, so old data is simply left
// behind under its old key rather than migrated.
const STORAGE_KEY = 'orion.db.v5';

function buildSeedUsers(): User[] {
  const now = new Date().toISOString();
  return (GROUPS as readonly Group[]).map((group, i) => ({
    id: `user_${i + 1}`,
    name: group,
    email: `${group.toLowerCase().replace(/\s+/g, '.')}@orion.gov`,
    groups: [group],
    status: 'Active',
    createdAt: now,
  }));
}

function buildSeedFundingSources(): FundingSource[] {
  const now = new Date().toISOString();
  const rows: Array<[string, FundingSource['maturity'], FundingSource['category']]> = [
    ['Above the Block (P)', 'Pipeline', 'External'],
    ['Above the Block', 'Approved', 'External'],
    ['Within the Block (P)', 'Pipeline', 'Internal'],
    ['Within the Block', 'Approved', 'Internal'],
    ['Central Digitalisation Board (P)', 'Pipeline', 'External'],
    ['Central Digitalisation Board', 'Approved', 'External'],
    ['Initial Budget (P)', 'Pipeline', 'External'],
    ['Initial Budget', 'Approved', 'External'],
  ];
  return rows.map(([name, maturity, category], i) => ({
    id: `fundsrc_${i + 1}`,
    name,
    maturity,
    category,
    status: 'Active',
    createdAt: now,
  }));
}

function buildSeedAccountCodes(): AccountCode[] {
  const now = new Date().toISOString();
  return [{ id: 'acct_1', code: '511604', description: 'ICT Consultation Services', createdAt: now }];
}

function buildSeedCostCentres(): CostCentreCode[] {
  const now = new Date().toISOString();
  return [{ id: 'cc_1', code: '998019', description: 'Minor Development Project', createdAt: now }];
}

function buildSeedInflationRates(): InflationRate[] {
  const now = new Date().toISOString();
  const rows: Array<[InflationItem, number]> = [
    ['Non IT Item', 3],
    ['IT Item', 5],
  ];
  return rows.map(([item, value], i) => ({ id: `inflation_${i + 1}`, item, value, updatedAt: now }));
}

function buildSeedBudgetPeriods(): BudgetPeriod[] {
  const now = new Date().toISOString();
  return (BUDGET_EXERCISE_TYPES as readonly BudgetExerciseType[]).map((type) => ({
    id: `budgetperiod_${type}`,
    type,
    status: 'Draft',
    startDate: null,
    endDate: null,
    updatedAt: now,
  }));
}

function emptyDb(): DbShape {
  return {
    users: buildSeedUsers(),
    fundingSources: buildSeedFundingSources(),
    accountCodes: buildSeedAccountCodes(),
    costCentres: buildSeedCostCentres(),
    inflationRates: buildSeedInflationRates(),
    projects: [],
    fundingEntries: [],
    budgetLines: [],
    finSupportedLines: [],
    teamMembers: [],
    budgetPeriods: buildSeedBudgetPeriods(),
    seq: 1,
  };
}

let db: DbShape | null = null;

export function getDb(): DbShape {
  if (db) return db;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      db = JSON.parse(raw) as DbShape;
      return db;
    } catch {
      /* fall through to reseed on corrupt data */
    }
  }
  db = emptyDb();
  saveDb();
  return db;
}

export function saveDb() {
  if (!db) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function nextId(prefix: string): string {
  const d = getDb();
  const id = `${prefix}_${d.seq}`;
  d.seq += 1;
  return id;
}

export function resetDb() {
  db = emptyDb();
  saveDb();
}
