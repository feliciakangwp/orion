import { Router } from 'express';
import { getDb, nextId, saveDb } from '../store.js';
import { requirePersona } from '../middleware.js';
import type { FundingEntry, FundingSource } from '../types.js';
import { EXTERNAL_FUNDING_SOURCES, INTERNAL_FUNDING_SOURCES } from '../types.js';

export const fundingRouter = Router();

function typeOf(source: FundingSource) {
  return (EXTERNAL_FUNDING_SOURCES as readonly string[]).includes(source) ? 'External' : 'Internal';
}

const ALL_SOURCES = [...EXTERNAL_FUNDING_SOURCES, ...INTERNAL_FUNDING_SOURCES];

fundingRouter.get('/projects/:projectId/funding', (req, res) => {
  res.json(getDb().fundingEntries.filter((f) => f.projectId === req.params.projectId));
});

fundingRouter.post('/projects/:projectId/funding', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!(persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can add a funding source' });
  }
  const { sourceOfFunding } = req.body ?? {};
  if (!ALL_SOURCES.includes(sourceOfFunding)) {
    return res.status(400).json({ error: 'Invalid Source of Funding' });
  }
  const now = new Date().toISOString();
  const entry: FundingEntry = {
    id: nextId('funding'),
    projectId: project.id,
    fundingPotId: '',
    sourceOfFunding,
    fundingType: typeOf(sourceOfFunding),
    status: 'Pipeline',
    createdAt: now,
    updatedAt: now,
  };
  db.fundingEntries.push(entry);
  saveDb();
  res.status(201).json(entry);
});

// Branch Rep can change the Source of Funding while it's still Pipeline.
// Mainstreaming entries are locked to Pipeline and can only be swapped to a
// different (non-Mainstreaming) source by the Branch Rep.
fundingRouter.patch('/funding/:id', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const entry = db.fundingEntries.find((f) => f.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === entry.projectId)!;
  if (!(persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can edit this entry' });
  }
  if (entry.status !== 'Pipeline') {
    return res.status(400).json({ error: 'Only Pipeline entries can be edited' });
  }
  const { sourceOfFunding } = req.body ?? {};
  if (sourceOfFunding) {
    if (!ALL_SOURCES.includes(sourceOfFunding)) {
      return res.status(400).json({ error: 'Invalid Source of Funding' });
    }
    if (sourceOfFunding === 'Mainstreaming' && entry.sourceOfFunding !== 'Mainstreaming') {
      return res.status(400).json({ error: 'Cannot change a funding source back to Mainstreaming' });
    }
    entry.sourceOfFunding = sourceOfFunding;
    entry.fundingType = typeOf(sourceOfFunding);
  }
  entry.updatedAt = new Date().toISOString();
  saveDb();
  res.json(entry);
});

fundingRouter.post('/funding/:id/approve', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const entry = db.fundingEntries.find((f) => f.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (persona.roleType !== 'Fin Officer' && persona.roleType !== 'Fin Manager') {
    return res.status(403).json({ error: 'Only Fin Officer or Fin Manager can approve funding' });
  }
  if (entry.sourceOfFunding === 'Mainstreaming') {
    return res.status(400).json({ error: 'Mainstreaming entries remain in Pipeline and cannot be approved' });
  }
  if (entry.status !== 'Pipeline') {
    return res.status(400).json({ error: 'Entry is not Pipeline' });
  }
  const { fundingPotId } = req.body ?? {};
  if (!fundingPotId) {
    return res.status(400).json({ error: 'Funding Pot ID is required to approve' });
  }
  entry.fundingPotId = fundingPotId;
  entry.status = 'Approved';
  entry.updatedAt = new Date().toISOString();
  saveDb();
  res.json(entry);
});

fundingRouter.delete('/funding/:id', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const entry = db.fundingEntries.find((f) => f.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === entry.projectId)!;
  if (!(persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can remove this entry' });
  }
  if (entry.status !== 'Pipeline') {
    return res.status(400).json({ error: 'Only Pipeline entries can be removed' });
  }
  db.fundingEntries = db.fundingEntries.filter((f) => f.id !== entry.id);
  saveDb();
  res.status(204).end();
});
