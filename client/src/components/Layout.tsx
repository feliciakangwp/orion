import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { resetDb } from '../local/db';

function UserImpersonationSwitcher() {
  const { users, currentUser, setCurrentUserId } = useAuth();
  const selectable = users.filter((u) => u.status === 'Active');
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-slate-200">
      <span className="shrink-0 text-slate-400">Impersonate</span>
      <select
        className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white sm:flex-none sm:py-1"
        value={currentUser?.id ?? ''}
        onChange={(e) => setCurrentUserId(e.target.value)}
      >
        {selectable.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SimulationYearControl() {
  const { simulationYear, setSimulationYear } = useAuth();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-200">
      <span className="shrink-0 text-slate-400">Simulation Year</span>
      <input
        type="number"
        className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white sm:w-24 sm:py-1"
        value={simulationYear}
        onChange={(e) => {
          const year = Number(e.target.value);
          if (Number.isFinite(year)) setSimulationYear(year);
        }}
      />
    </label>
  );
}

function SimulationDateControl() {
  const { simulationDate, setSimulationDate, resetSimulationDateToToday } = useAuth();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-200">
      <span className="shrink-0 text-slate-400">Simulation Date</span>
      <input
        type="date"
        className="rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white sm:py-1"
        value={simulationDate}
        onChange={(e) => {
          if (e.target.value) setSimulationDate(e.target.value);
        }}
      />
      <button
        type="button"
        className="shrink-0 rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 sm:py-1"
        onClick={resetSimulationDateToToday}
      >
        Today
      </button>
    </label>
  );
}

function NavItem({ to, children, onNavigate }: { to: string; children: ReactNode; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `block rounded px-3 py-2 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`
      }
    >
      {children}
    </NavLink>
  );
}

function NavHeader({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</div>;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser } = useAuth();
  const groups = currentUser?.groups ?? [];
  const isFinanceAdmin = groups.includes('Finance Admin');
  const isSuperAdmin = groups.includes('Super Admin');

  return (
    <>
      <div className="px-5 py-5 text-xl font-bold tracking-wide text-white">ORION</div>
      <nav className="mt-2 flex-1 overflow-y-auto px-3">
        <NavHeader>Project Profile</NavHeader>
        <NavItem to="/projects" onNavigate={onNavigate}>
          Project Profile
        </NavItem>

        {isFinanceAdmin && (
          <>
            <NavHeader>Finance Admin</NavHeader>
            <NavItem to="/finance-admin/funding" onNavigate={onNavigate}>
              Source of Funding
            </NavItem>
          </>
        )}

        {isSuperAdmin && (
          <>
            <NavHeader>IT Admin</NavHeader>
            <NavItem to="/it-admin/users" onNavigate={onNavigate}>
              User Management
            </NavItem>
          </>
        )}
      </nav>
      <div className="border-t border-slate-800 px-3 py-3 text-xs text-slate-500">
        <p>Budget Performance Management System</p>
        <p className="mt-1">All data lives only in this browser.</p>
        <button
          className="mt-2 text-indigo-400 hover:text-indigo-300 hover:underline"
          onClick={() => {
            if (confirm('Reset all ORION demo data in this browser? This cannot be undone.')) {
              resetDb();
              window.location.reload();
            }
          }}
        >
          Reset Demo Data
        </button>
      </div>
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      {/* Mobile backdrop, shown only while the drawer is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[80vw] shrink-0 -translate-x-full flex-col bg-slate-900 text-slate-200 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : ''
        }`}
      >
        <SidebarContent onNavigate={() => setSidebarOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900 px-3 py-2 sm:px-5">
          <button
            className="shrink-0 rounded p-1.5 text-slate-300 hover:bg-slate-800 md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-300">
            <span className="hidden lg:inline">ORION &mdash; Budget Performance Management System</span>
            <span className="lg:hidden">ORION</span>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:flex-nowrap lg:gap-5">
            <SimulationYearControl />
            <SimulationDateControl />
            <UserImpersonationSwitcher />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
