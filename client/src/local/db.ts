import { BUDGET_EXERCISE_TYPES, GROUPS } from '../types';
import type {
  AccountCode,
  AccountLevel,
  BudgetExerciseType,
  BudgetLine,
  BudgetPeriod,
  CostCentreCode,
  CostCentreType,
  ExpenditureNature,
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

// Bumped again from orion.db.v5: sample named users (generic one-per-group
// seeds now Inactive), Mainstreaming funding source, Account/CostCentre
// restructures (level/opsOrDev/status; code/name/type/nature/FinanceOfficer)
// and new FundingEntry fields (pot/fund amount/dates/cost centres) — this
// is a clean slate with a different shape, so old data is simply left
// behind under its old key rather than migrated.
const STORAGE_KEY = 'orion.db.v6';

function buildSeedUsers(): User[] {
  const now = new Date().toISOString();
  // The original one-per-group placeholder users are kept (so nothing that
  // referenced them by id breaks) but marked Inactive now that named sample
  // users cover every group — "Inactive all the generic names".
  const generic: User[] = (GROUPS as readonly Group[]).map((group, i) => ({
    id: `user_${i + 1}`,
    name: group,
    email: `${group.toLowerCase().replace(/\s+/g, '.')}@orion.gov`,
    groups: [group],
    status: 'Inactive',
    createdAt: now,
  }));
  const named: Array<[string, string, Group[]]> = [
    ['Felicia Kang', 'felicia_kang@customs.gov.sg', ['Super Admin', 'Branch Rep']],
    ['Jason Cheah', 'jason_cheah@customs.gov.sg', ['Super Admin', 'Branch Rep']],
    ['Francine Chua', 'francine_chua@customs.gov.sg', ['Finance Manager', 'Head']],
    ['Tan Sok Buay Tiffany', 'tan_sok_buay@customs.gov.sg', ['Finance Manager', 'Finance Admin', 'DY Head']],
    ['Chen Yu', 'chen_yu@customs.gov.sg', ['Finance Officer', 'Finance Admin']],
    ['Lim Shu Ying', 'lim_shu_ying@customs.gov.sg', ['Finance Officer', 'Finance Admin']],
    ['Tan Chun Huat', 'tan_chun_huat@customs.gov.sg', ['Finance Officer']],
    ['Jason Yong', 'jason_yong@customs.gov.sg', ['Branch Rep']],
    ['Jeffrey Choy', 'jeffrey_choy@customs.gov.sg', ['Branch Rep']],
    ['Pamela Chan', 'pamela_chan@customs.gov.sg', ['Branch Rep']],
    ['Andy Ong', 'andy_ong@customs.gov.sg', ['DY Head']],
    ['Jonathan Tay', 'jonathan_tay@customs.gov.sg', ['DY Head']],
    ['Ken Ng', 'ken_ng@customs.gov.sg', ['Head']],
    ['Sumathi Govindarajan', 'sumathi_govindarajan@customs.gov.sg', ['Head', 'HR']],
    ['Cheryl Sim', 'cheryl_sim@customs.gov.sg', ['CIO']],
    ['Loy Jia Leng', 'loy_jia_leng@customs.gov.sg', ['HR']],
    ['Karen Lim', 'karen_lim@customs.gov.sg', ['HR', 'SMGT']],
    ['Raine Ng', 'raine_ng@customs.gov.sg', ['SMGT']],
    ['Teh Thiam Siong', 'teh_thiam_siong@gov.sg', ['SMGT']],
  ];
  const namedUsers: User[] = named.map(([name, email, groups], i) => ({
    id: `user_${generic.length + i + 1}`,
    name,
    email,
    groups,
    status: 'Active',
    createdAt: now,
  }));
  return [...generic, ...namedUsers];
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
    // System-computed only — never offered on the Branch Rep/Finance
    // pickers (see SourceOfFundingTab.tsx); exists so a mainstreamed
    // amount has a catalog entry to be shown against.
    ['Mainstreaming', 'Pipeline', 'Internal'],
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
  const rows: Array<[string, string, AccountLevel, AccountCode['opsOrDev']]> = [
    // Development branch
    ['5000', 'Development Expenditure', 1, 'Development'],
    ['5100', 'Government Development', 2, 'Development'],
    ['5110', 'Government Development (Capitalise)', 3, 'Development'],
    ['5111', 'Manpower', 4, 'Development'],
    ['5112', 'Asset Acquisition', 4, 'Development'],
    ['5116', 'Services', 4, 'Development'],
    ['511101', 'Manpower from Suppliers', 5, 'Development'],
    ['511102', 'Manpower from Secondment', 5, 'Development'],
    ['511201', 'IT Equipment', 5, 'Development'],
    ['511202', 'Office Equipment', 5, 'Development'],
    ['511603', 'Software as a Service', 5, 'Development'],
    ['511604', 'ICT Consultation Services', 5, 'Development'],
    ['511605', 'Audit Services', 5, 'Development'],
    // Operating branch (dummy mirror, so both natures have real options)
    ['6000', 'Operating Expenditure', 1, 'Operating'],
    ['6100', 'Manpower Operating', 2, 'Operating'],
    ['6110', 'Manpower Operating (Recurrent)', 3, 'Operating'],
    ['6111', 'Salaries', 4, 'Operating'],
    ['6116', 'Services', 4, 'Operating'],
    ['611101', 'Basic Salaries', 5, 'Operating'],
    ['611102', 'Overtime Pay', 5, 'Operating'],
    ['611601', 'Cleaning Services', 5, 'Operating'],
    ['611602', 'Maintenance Services', 5, 'Operating'],
  ];
  return rows.map(([code, description, level, opsOrDev], i) => ({
    id: `acct_${i + 1}`,
    code,
    description,
    level,
    opsOrDev,
    status: 'Active',
    createdAt: now,
  }));
}

function buildSeedCostCentres(): CostCentreCode[] {
  const now = new Date().toISOString();
  // Finance Officer tags reference the named Finance Officer users seeded
  // above: Chen Yu = user_15, Lim Shu Ying = user_16, Tan Chun Huat = user_17.
  const rows: Array<[string, string, CostCentreType, ExpenditureNature, string]> = [
    ['998019', 'Minor Development Project', 'NO01 Administration', 'Development', 'user_15'],
    ['712045', 'Trade Facilitation Services', 'NO02 Revenue', 'Operating', 'user_16'],
    ['834210', 'Container Scanning Operations', 'NO03 Preventive', 'Operating', 'user_17'],
    ['556789', 'Customs Systems Modernisation', 'NO01 Administration', 'Development', 'user_15'],
    ['923456', 'Passenger Clearance Services', 'NO02 Revenue', 'Operating', 'user_16'],
    ['641287', 'K9 Unit Training Facility', 'NO03 Preventive', 'Development', 'user_17'],
  ];
  return rows.map(([code, name, type, natureOfExpenditure, financeOfficerUserId], i) => ({
    id: `cc_${i + 1}`,
    code,
    name,
    type,
    natureOfExpenditure,
    financeOfficerUserId,
    createdAt: now,
  }));
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
