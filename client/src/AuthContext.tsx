import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setApiUser } from './api';
import type { User } from './types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface AuthContextValue {
  users: User[];
  currentUser: User | null;
  setCurrentUserId: (id: string) => void;
  reloadUsers: () => void;
  loading: boolean;
  // Global "what-if" simulation year, applied across every project's MTE and
  // Block tabs (rather than being a per-project setting) so a reviewer can
  // consistently compare projects on the same FY horizon.
  simulationYear: number;
  setSimulationYear: (year: number) => void;
  // A separate global "pretend today is this date" setting, for scenarios
  // that need a specific calendar date rather than just a fiscal year.
  simulationDate: string; // YYYY-MM-DD
  setSimulationDate: (date: string) => void;
  resetSimulationDateToToday: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_STORAGE_KEY = 'orion.userId';
const YEAR_STORAGE_KEY = 'orion.simulationYear';
const DATE_STORAGE_KEY = 'orion.simulationDate';

function readStoredYear(): number {
  const raw = localStorage.getItem(YEAR_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
}

function readStoredDate(): string {
  return localStorage.getItem(DATE_STORAGE_KEY) || todayISO();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  // Track the acting user synchronously, not just via a useEffect: React
  // fires a child component's effects before its ancestor's, so a consumer
  // that re-fetches on user change in its own effect could otherwise run a
  // tick before the api module's acting-user id was actually updated,
  // silently reading stale/wrong-permission data for one render.
  const [currentUserId, setCurrentUserIdRaw] = useState<string | null>(() => {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    setApiUser(stored);
    return stored;
  });
  const [simulationYear, setSimulationYearState] = useState<number>(readStoredYear);
  const [simulationDate, setSimulationDateState] = useState<string>(readStoredDate);
  const [loading, setLoading] = useState(true);

  function setCurrentUserId(id: string) {
    setApiUser(id);
    localStorage.setItem(USER_STORAGE_KEY, id);
    setCurrentUserIdRaw(id);
  }

  useEffect(() => {
    reloadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reloadUsers() {
    api.users.list().then((list) => {
      setUsers(list);
      setLoading(false);
      if (!currentUserId && list.length > 0) {
        setCurrentUserId(list[0].id);
      }
    });
  }

  useEffect(() => {
    localStorage.setItem(YEAR_STORAGE_KEY, String(simulationYear));
  }, [simulationYear]);

  useEffect(() => {
    localStorage.setItem(DATE_STORAGE_KEY, simulationDate);
  }, [simulationDate]);

  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId) ?? null, [users, currentUserId]);

  return (
    <AuthContext.Provider
      value={{
        users,
        currentUser,
        setCurrentUserId,
        reloadUsers,
        loading,
        simulationYear,
        setSimulationYear: setSimulationYearState,
        simulationDate,
        setSimulationDate: setSimulationDateState,
        resetSimulationDateToToday: () => setSimulationDateState(todayISO()),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
