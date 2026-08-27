import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setApiPersona } from './api';
import type { Persona } from './types';

interface PersonaContextValue {
  personas: Persona[];
  currentPersona: Persona | null;
  setCurrentPersonaId: (id: string) => void;
  loading: boolean;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

const STORAGE_KEY = 'orion.personaId';

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [currentPersonaId, setCurrentPersonaIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.personas.list().then((list) => {
      setPersonas(list);
      setLoading(false);
      if (!currentPersonaId && list.length > 0) {
        setCurrentPersonaIdState(list[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setApiPersona(currentPersonaId);
    if (currentPersonaId) localStorage.setItem(STORAGE_KEY, currentPersonaId);
  }, [currentPersonaId]);

  const currentPersona = useMemo(
    () => personas.find((p) => p.id === currentPersonaId) ?? null,
    [personas, currentPersonaId]
  );

  return (
    <PersonaContext.Provider
      value={{ personas, currentPersona, setCurrentPersonaId: setCurrentPersonaIdState, loading }}
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
