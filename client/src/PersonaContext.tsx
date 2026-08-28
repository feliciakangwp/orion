import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setApiPersona } from './api';
import type { Persona } from './types';

interface PersonaContextValue {
  personas: Persona[];
  currentPersona: Persona | null;
  setCurrentPersonaId: (id: string) => void;
  loading: boolean;
  // Global "what-if" simulation year, applied across every project's MTE and
  // Block tabs (rather than being a per-project setting) so a reviewer can
  // consistently compare projects on the same FY horizon.
  simulationYear: number;
  setSimulationYear: (year: number) => void;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

const PERSONA_STORAGE_KEY = 'orion.personaId';
const YEAR_STORAGE_KEY = 'orion.simulationYear';

function readStoredYear(): number {
  const raw = localStorage.getItem(YEAR_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  // Track the acting persona in a ref, not just state: api.ts's module-level
  // currentPersonaId must be updated synchronously, in the same tick as the
  // change, never via a useEffect. React fires a child component's effects
  // before its ancestor's, so a consumer (e.g. BudgetLinesTab) that re-fetches
  // on persona change in its own effect would otherwise run before this
  // provider's effect had a chance to call setApiPersona — reading the
  // *previous* persona's data for one render.
  const [currentPersonaId, setCurrentPersonaIdRaw] = useState<string | null>(() => {
    const stored = localStorage.getItem(PERSONA_STORAGE_KEY);
    setApiPersona(stored);
    return stored;
  });
  const [simulationYear, setSimulationYearState] = useState<number>(readStoredYear);
  const [loading, setLoading] = useState(true);

  function setCurrentPersonaId(id: string) {
    setApiPersona(id);
    localStorage.setItem(PERSONA_STORAGE_KEY, id);
    setCurrentPersonaIdRaw(id);
  }

  useEffect(() => {
    api.personas.list().then((list) => {
      setPersonas(list);
      setLoading(false);
      if (!currentPersonaId && list.length > 0) {
        setCurrentPersonaId(list[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(YEAR_STORAGE_KEY, String(simulationYear));
  }, [simulationYear]);

  const currentPersona = useMemo(
    () => personas.find((p) => p.id === currentPersonaId) ?? null,
    [personas, currentPersonaId]
  );

  return (
    <PersonaContext.Provider
      value={{
        personas,
        currentPersona,
        setCurrentPersonaId,
        loading,
        simulationYear,
        setSimulationYear: setSimulationYearState,
      }}
    >
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider');
  return ctx;
}
