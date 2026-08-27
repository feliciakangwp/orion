import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { usePersona } from '../PersonaContext';

function PersonaSwitcher() {
  const { personas, currentPersona, setCurrentPersonaId } = usePersona();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-200">
      <span className="text-slate-400">Acting as</span>
      <select
        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
        value={currentPersona?.id ?? ''}
        onChange={(e) => setCurrentPersonaId(e.target.value)}
      >
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900 text-slate-200">
        <div className="px-5 py-5 text-xl font-bold tracking-wide text-white">ORION</div>
        <nav className="mt-2 flex-1 overflow-y-auto px-3">
          <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Project Profile
          </div>
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `block rounded px-3 py-2 text-sm ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            Project Profile
          </NavLink>
        </nav>
        <div className="border-t border-slate-800 px-3 py-3 text-xs text-slate-500">
          Budget Performance Management System
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-5">
          <div className="text-sm font-medium text-slate-300">
            ORION &mdash; Budget Performance Management System
          </div>
          <PersonaSwitcher />
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
