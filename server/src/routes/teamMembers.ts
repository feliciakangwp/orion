import { Router } from 'express';
import { getDb, nextId, saveDb } from '../store.js';
import { requirePersona } from '../middleware.js';
import type { TeamMember } from '../types.js';

export const teamMembersRouter = Router();

teamMembersRouter.get('/projects/:projectId/team-members', (req, res) => {
  res.json(getDb().teamMembers.filter((m) => m.projectId === req.params.projectId));
});

teamMembersRouter.post('/projects/:projectId/team-members', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const project = db.projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!(persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can add team members' });
  }
  const { personaId } = req.body ?? {};
  const exists = db.personas.some((p) => p.id === personaId);
  if (!exists) return res.status(400).json({ error: 'Invalid persona' });
  if (db.teamMembers.some((m) => m.projectId === project.id && m.personaId === personaId)) {
    return res.status(400).json({ error: 'This person is already a team member' });
  }
  const member: TeamMember = {
    id: nextId('member'),
    projectId: project.id,
    personaId,
    createdAt: new Date().toISOString(),
  };
  db.teamMembers.push(member);
  saveDb();
  res.status(201).json(member);
});

teamMembersRouter.delete('/team-members/:id', (req, res) => {
  const persona = requirePersona(req, res);
  if (!persona) return;
  const db = getDb();
  const member = db.teamMembers.find((m) => m.id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  const project = db.projects.find((p) => p.id === member.projectId)!;
  if (!(persona.roleType === 'Branch Rep' && persona.dept === project.openedByDept)) {
    return res.status(403).json({ error: 'Only the owning Branch Rep can remove team members' });
  }
  db.teamMembers = db.teamMembers.filter((m) => m.id !== member.id);
  saveDb();
  res.status(204).end();
});
