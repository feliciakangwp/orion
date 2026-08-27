import { Router } from 'express';
import { getDb } from '../store.js';

export const personasRouter = Router();

personasRouter.get('/', (_req, res) => {
  res.json(getDb().personas);
});
