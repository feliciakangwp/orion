import { Router } from 'express';
import { getDb, nextId, saveDb } from '../store.js';
import { requirePersona } from '../middleware.js';
import type { BudgetKind, BudgetLine, HistoryEntry } from '../types.js';
import { applyRecurringInflation, emptyPeriods, periodKeys, sumPeriods } from '../lib/calc.js';
import {
  canApprove,
  canSubmit,
  isEditableByBranchRep,
  nextOnApprove,
  nextOnSubmit,
  personaCanAct,
  statusFor,
} from '../lib/workflow.js';

export const budgetLinesRouter = Router();

function withComputed(line: BudgetLine) {
  return { ...line, status: statusFor(line), total: sumPeriods(line.periods) };
}

function isOwningBranchRep(persona: { roleType: string; dept: string | null }, project: { openedByDept: string }) {
  return persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept;
}

budgetLinesRouter.get('/projects/:projectId/budget-lines', (req, res) => {
  const kind = req.query.kind as BudgetKind | undefined;
  let lines = getDb().budgetLines.filter((l) => l.projectId === req.params.projectId);
  if (kind) lines = lines.filter((l) => l.kind === kind);
  res.json(lines.map(withComputed));
});

budgetLinesRouter.post('/projects/:projectId/budget-lines', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!isOwningBranchRep(persona, project)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can add a budget line' });
  }
  const kind = req.body?.kind as BudgetKind;
  if (!['MTE', 'BLOCK', 'RB', 'OB'].includes(kind)) {
    return res.status(400).json({ error: 'Invalid kind' });
  }
  const origin = req.body?.origin === 'carried_forward' ? 'carried_forward' : 'new';
  // The simulation year is a global, client-side "what-if" setting rather
  // than something stored per project, so the caller passes it explicitly
  // for whichever FY horizon it wants new MTE/Block periods generated on.
  const simulationYear = Number(req.body?.simulationYear) || new Date().getFullYear();
  const now = new Date().toISOString();
  const line: BudgetLine = {
    id: nextId('line'),
    projectId: project.id,
    kind,
    origin,
    step: 'BRANCH_REP_DRAFT',
    description: '',
    opsOrDev: '',
    account: '',
    subAcct: '',
    fundingEntryId: null,
    recurring: '',
    costCentre: '',
    itProject: '',
    ictExp: '',
    buildOrBuy: '',
    basis: '',
    budgetType: kind === 'RB' || kind === 'OB' ? kind : null,
    periods: emptyPeriods(kind, simulationYear),
    assignedToPersonaId: persona.id,
    reviewer1PersonaId: null,
    reviewer2PersonaId: null,
    approverPersonaId: null,
    financeOfficerPersonaId: null,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  db.budgetLines.push(line);
  saveDb();
  res.status(201).json(withComputed(line));
});

const EDITABLE_FIELDS = [
  'description',
  'opsOrDev',
  'account',
  'subAcct',
  'fundingEntryId',
  'recurring',
  'costCentre',
  'itProject',
  'ictExp',
  'buildOrBuy',
  'basis',
  'reviewer1PersonaId',
  'reviewer2PersonaId',
  'approverPersonaId',
  'financeOfficerPersonaId',
] as const;

budgetLinesRouter.patch('/budget-lines/:id', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const line = db.budgetLines.find((l) => l.id === req.params.id);
  if (!line) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === line.projectId)!;
  if (!isOwningBranchRep(persona, project)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can edit this line' });
  }
  if (!isEditableByBranchRep(line.step)) {
    return res.status(400).json({ error: 'This line is not currently editable' });
  }
  const body = req.body ?? {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) (line as any)[field] = body[field];
  }
  if (!line.itProject || line.itProject !== 'Yes') {
    line.ictExp = '';
    line.buildOrBuy = '';
  }

  // Recompute periods: if recurring, auto-populate from the first period's
  // base amount with y-o-y inflation. Otherwise take whatever was supplied.
  // simulationYear is the caller's current global setting, not project state.
  const simulationYear = Number(body.simulationYear) || new Date().getFullYear();
  const keys = periodKeys(line.kind, simulationYear);
  if ('periods' in body) {
    const incoming = body.periods as Record<string, number>;
    if (line.recurring === 'Yes') {
      const baseAmount = Number(incoming[keys[0]] ?? line.periods[keys[0]] ?? 0);
      line.periods = applyRecurringInflation(line.kind, simulationYear, line.recurring, line.itProject, baseAmount);
    } else {
      line.periods = { ...emptyPeriods(line.kind, simulationYear), ...line.periods, ...incoming };
    }
  } else if ('recurring' in body || 'itProject' in body) {
    // Toggling recurring/IT-project recalculates from the existing base amount.
    if (line.recurring === 'Yes') {
      const baseAmount = Number(line.periods[keys[0]] ?? 0);
      line.periods = applyRecurringInflation(line.kind, simulationYear, line.recurring, line.itProject, baseAmount);
    }
  }

  line.updatedAt = new Date().toISOString();
  saveDb();
  res.json(withComputed(line));
});

budgetLinesRouter.delete('/budget-lines/:id', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const line = db.budgetLines.find((l) => l.id === req.params.id);
  if (!line) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === line.projectId)!;
  if (!isOwningBranchRep(persona, project)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can delete this line' });
  }
  if (line.step !== 'BRANCH_REP_DRAFT') {
    return res.status(400).json({ error: 'Only lines still in Draft can be deleted' });
  }
  db.budgetLines = db.budgetLines.filter((l) => l.id !== line.id);
  saveDb();
  res.status(204).end();
});

function pushHistory(line: BudgetLine, personaId: string, action: string, from: BudgetLine['step'], to: BudgetLine['step'], note?: string) {
  const entry: HistoryEntry = { at: new Date().toISOString(), byPersonaId: personaId, action, fromStep: from, toStep: to, note };
  line.history.push(entry);
}

budgetLinesRouter.post('/budget-lines/:id/submit', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const line = db.budgetLines.find((l) => l.id === req.params.id);
  if (!line) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === line.projectId)!;
  if (!isOwningBranchRep(persona, project)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can submit this line' });
  }
  if (!canSubmit(line.step)) {
    return res.status(400).json({ error: 'This line cannot be submitted from its current status' });
  }
  if (!line.reviewer1PersonaId) {
    return res.status(400).json({ error: 'Reviewer 1 must be selected before submitting' });
  }
  if (line.step === 'BRANCH_REP_READY') {
    if (!line.reviewer2PersonaId || !line.approverPersonaId) {
      return res.status(400).json({ error: 'Reviewer 1, Reviewer 2 and Approver must all be selected before submitting for final approval' });
    }
  }
  const from = line.step;
  line.step = nextOnSubmit(line.step);
  pushHistory(line, persona.id, 'submit', from, line.step);
  line.updatedAt = new Date().toISOString();
  saveDb();
  res.json(withComputed(line));
});

budgetLinesRouter.post('/budget-lines/:id/approve', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const line = db.budgetLines.find((l) => l.id === req.params.id);
  if (!line) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === line.projectId)!;
  if (!canApprove(line.step)) {
    return res.status(400).json({ error: 'This line is not awaiting approval' });
  }
  if (!personaCanAct(line, persona, project.openedByDept)) {
    return res.status(403).json({ error: 'You are not the assigned approver for this step' });
  }
  if (line.step === 'FIN_OFFICER_R1' || line.step === 'FIN_OFFICER_R2') {
    line.financeOfficerPersonaId = persona.id;
  }
  const from = line.step;
  line.step = nextOnApprove(line.step);
  pushHistory(line, persona.id, 'approve', from, line.step);
  line.updatedAt = new Date().toISOString();
  saveDb();
  res.json(withComputed(line));
});

budgetLinesRouter.post('/budget-lines/:id/return', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const line = db.budgetLines.find((l) => l.id === req.params.id);
  if (!line) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === line.projectId)!;
  if (!personaCanAct(line, persona, project.openedByDept)) {
    return res.status(403).json({ error: 'You are not the assigned approver for this step' });
  }
  const from = line.step;
  line.step = 'BRANCH_REP_DRAFT';
  pushHistory(line, persona.id, 'return', from, line.step, req.body?.note);
  line.updatedAt = new Date().toISOString();
  saveDb();
  res.json(withComputed(line));
});
