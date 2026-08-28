import { Router } from 'express';
import { getDb, nextId, saveDb } from '../store.js';
import { requirePersona } from '../middleware.js';
import type { Project } from '../types.js';

export const projectsRouter = Router();

projectsRouter.get('/', (_req, res) => {
  res.json(getDb().projects);
});

projectsRouter.get('/:id', (req, res) => {
  const project = getDb().projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

projectsRouter.post('/', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  if (persona.roleType !== 'Branch Rep') {
    return res.status(403).json({ error: 'Only a Branch Rep can create a project' });
  }
  const { title, justification, additionalComments } = req.body ?? {};
  if (!title || !justification) {
    return res.status(400).json({ error: 'Project Title and Justification of Expenditure are required' });
  }
  const now = new Date().toISOString();
  const project: Project = {
    id: nextId('project'),
    title,
    status: 'Draft',
    justification,
    additionalComments: additionalComments ?? '',
    subAccount: '',
    developmentCostCentre: '',
    operatingCostCentre: '',
    financeOfficerId: null,
    openedByPersonaId: persona.id,
    openedByDept: persona.dept!,
    createdAt: now,
    updatedAt: now,
  };
  getDb().projects.push(project);
  saveDb();
  res.status(201).json(project);
});

function isBranchRepOwner(persona: { id: string; roleType: string; dept: string | null }, project: Project) {
  return persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept;
}

// General field update: Branch Rep can edit Details fields while in Draft;
// Finance (Fin Officer/Fin Manager) can edit the finance-owned fields once
// the project has been routed to them (Request to Create).
projectsRouter.patch('/:id', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const body = req.body ?? {};
  const isFinance = persona.roleType === 'Fin Officer' || persona.roleType === 'Fin Manager';

  if (isBranchRepOwner(persona, project) && project.status === 'Draft') {
    if ('title' in body) project.title = body.title;
    if ('justification' in body) project.justification = body.justification;
    if ('additionalComments' in body) project.additionalComments = body.additionalComments;
  }

  if (isFinance && project.status === 'Request to Create') {
    if ('subAccount' in body) project.subAccount = body.subAccount;
    if ('developmentCostCentre' in body) project.developmentCostCentre = body.developmentCostCentre;
    if ('operatingCostCentre' in body) project.operatingCostCentre = body.operatingCostCentre;
    if ('financeOfficerId' in body) project.financeOfficerId = body.financeOfficerId;
  }

  project.updatedAt = new Date().toISOString();
  saveDb();
  res.json(project);
});

projectsRouter.post('/:id/submit-request', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const project = getDb().projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (!isBranchRepOwner(persona, project)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can submit this request' });
  }
  if (project.status !== 'Draft') {
    return res.status(400).json({ error: 'Project is not in Draft status' });
  }
  if (!project.title || !project.justification) {
    return res.status(400).json({ error: 'Project Title and Justification of Expenditure are required' });
  }
  project.status = 'Request to Create';
  project.updatedAt = new Date().toISOString();
  saveDb();
  res.json(project);
});

projectsRouter.post('/:id/approve', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const project = getDb().projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (persona.roleType !== 'Fin Officer' && persona.roleType !== 'Fin Manager') {
    return res.status(403).json({ error: 'Only Finance can approve project creation' });
  }
  if (project.status !== 'Request to Create') {
    return res.status(400).json({ error: 'Project is not awaiting Finance approval' });
  }
  if (!project.subAccount || !project.developmentCostCentre || !project.operatingCostCentre || !project.financeOfficerId) {
    return res.status(400).json({
      error: 'Sub Account, Development Cost Centre, Operating Cost Centre and Finance Officer must be filled before approving',
    });
  }
  project.status = 'Active';
  project.updatedAt = new Date().toISOString();
  saveDb();
  res.json(project);
});
