import fs from 'node:fs';
import path from 'node:path';
import type { DbShape } from './types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function emptyDb(): DbShape {
  return {
    personas: [],
    projects: [],
    fundingEntries: [],
    budgetLines: [],
    teamMembers: [],
    seq: 1,
  };
}

let db: DbShape;

export function loadDb(): DbShape {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    db = emptyDb();
    saveDb();
  } else {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  }
  return db;
}

export function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function getDb(): DbShape {
  if (!db) loadDb();
  return db;
}

export function nextId(prefix: string): string {
  const d = getDb();
  const id = `${prefix}_${d.seq}`;
  d.seq += 1;
  return id;
}

export function resetDb(fresh: DbShape) {
  db = fresh;
  saveDb();
}
