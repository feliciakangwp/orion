import type { NextFunction, Request, Response } from 'express';
import { getDb } from './store.js';
import type { Persona } from './types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actingPersona?: Persona;
    }
  }
}

// Resolves the acting persona from the x-persona-id header, simulating auth
// for this prototype (there is no real login system in scope).
export function attachPersona(req: Request, _res: Response, next: NextFunction) {
  const id = req.header('x-persona-id');
  if (id) {
    req.actingPersona = getDb().personas.find((p) => p.id === id);
  }
  next();
}

export function requirePersona(req: Request, res: Response): Persona | null {
  if (!req.actingPersona) {
    res.status(401).json({ error: 'Missing or unknown x-persona-id header' });
    return null;
  }
  return req.actingPersona;
}
