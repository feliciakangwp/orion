import cors from 'cors';
import express from 'express';
import { attachPersona } from './middleware.js';
import { budgetLinesRouter } from './routes/budgetLines.js';
import { fundingRouter } from './routes/funding.js';
import { personasRouter } from './routes/personas.js';
import { projectsRouter } from './routes/projects.js';
import { teamMembersRouter } from './routes/teamMembers.js';
import { buildSeedDb } from './seed.js';
import { getDb, loadDb, resetDb } from './store.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(attachPersona);

loadDb();
if (getDb().personas.length === 0) {
  resetDb(buildSeedDb());
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/personas', personasRouter);
app.use('/api/projects', projectsRouter);
app.use('/api', fundingRouter);
app.use('/api', budgetLinesRouter);
app.use('/api', teamMembersRouter);

// Dev-only helper to wipe and reseed the datastore.
app.post('/api/dev/reseed', (_req, res) => {
  resetDb(buildSeedDb());
  res.json({ ok: true });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`ORION server listening on http://localhost:${PORT}`);
});
