import { DEPTS, DEPT_ROLE_TYPES } from '../types';
import type {
  BudgetLine,
  Dept,
  FundingEntry,
  Persona,
  Project,
  TeamMember,
} from '../types';

// status/total are always derived (see lib/workflow.ts statusFor / lib/calc.ts
// sumPeriods) rather than stored, mirroring how the original server never
// persisted them either — only its JSON responses included them.
export type StoredBudgetLine = Omit<BudgetLine, 'status' | 'total'>;

export interface DbShape {
  personas: Persona[];
  projects: Project[];
  fundingEntries: FundingEntry[];
  budgetLines: StoredBudgetLine[];
  teamMembers: TeamMember[];
  seq: number;
}

const STORAGE_KEY = 'orion.db.v1';

function buildSeedPersonas(): Persona[] {
  const personas: Persona[] = [];
  let n = 1;
  for (const dept of DEPTS as readonly Dept[]) {
    for (const roleType of DEPT_ROLE_TYPES) {
      personas.push({ id: `persona_${n++}`, name: `${dept} ${roleType}`, roleType, dept });
    }
  }
  for (const name of ['Fin Officer 1', 'Fin Officer 2', 'Fin Officer 3']) {
    personas.push({ id: `persona_${n++}`, name, roleType: 'Fin Officer', dept: null });
  }
  personas.push({ id: `persona_${n++}`, name: 'Fin Manager', roleType: 'Fin Manager', dept: null });
  return personas;
}

function emptyDb(): DbShape {
  return {
    personas: buildSeedPersonas(),
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
