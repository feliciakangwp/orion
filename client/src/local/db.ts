import { GROUPS } from '../types';
import type {
  BudgetLine,
  FundingEntry,
  FundingSource,
  Group,
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
  projects: Project[];
  fundingEntries: FundingEntry[];
  budgetLines: StoredBudgetLine[];
  teamMembers: TeamMember[];
  seq: number;
}

// Bumped from the old persona-based schema (orion.db.v1): this is a clean
// slate with a different shape (Users/Groups instead of Personas, a funding
// catalog instead of a hardcoded enum), so old data is simply left behind
// under its old key rather than migrated.
const STORAGE_KEY = 'orion.db.v2';

function buildSeedUsers(): User[] {
  const now = new Date().toISOString();
  return (GROUPS as readonly Group[]).map((group, i) => ({
    id: `user_${i + 1}`,
    name: group,
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

function emptyDb(): DbShape {
  return {
    users: buildSeedUsers(),
    fundingSources: buildSeedFundingSources(),
    projects: [],
    fundingEntries: [],
    budgetLines: [],
    teamMembers: [],
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
