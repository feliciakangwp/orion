import type { DbShape, Persona } from './types.js';
import { DEPTS, DEPT_ROLE_TYPES } from './types.js';

export function buildSeedPersonas(): Persona[] {
  const personas: Persona[] = [];
  let n = 1;
  for (const dept of DEPTS) {
    for (const roleType of DEPT_ROLE_TYPES) {
      personas.push({
        id: `persona_${n++}`,
        name: `${dept} ${roleType}`,
        roleType,
        dept,
      });
    }
  }
  for (const name of ['Fin Officer 1', 'Fin Officer 2', 'Fin Officer 3']) {
    personas.push({ id: `persona_${n++}`, name, roleType: 'Fin Officer', dept: null });
  }
  personas.push({ id: `persona_${n++}`, name: 'Fin Manager', roleType: 'Fin Manager', dept: null });
  return personas;
}

export function buildSeedDb(): DbShape {
  return {
    personas: buildSeedPersonas(),
    projects: [],
    fundingEntries: [],
    budgetLines: [],
    teamMembers: [],
    seq: 1,
  };
}
