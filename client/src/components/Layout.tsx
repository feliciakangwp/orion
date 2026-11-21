import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { isSuperAdmin } from '../lib/workflow';
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

function NavItem({
  to,
  children,
  onNavigate,
  end,
}: {
  to: string;
  children: ReactNode;
  onNavigate?: () => void;
  // NavLink's default matching is prefix-based, so "/projects" would also
  // highlight while on "/projects/requests" unless told to match exactly.
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `block rounded px-3 py-2 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`
      }
    >
      {children}
    </NavLink>
  );
}

// Collapsed by default, so the sidebar opens short — click a section's
// header to expand it and see its tabs.
function NavSection({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
        aria-expanded={open}
      >
        <span>{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {open && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser } = useAuth();
  const superAdmin = !!currentUser && isSuperAdmin(currentUser);
  const isFinanceAdmin = superAdmin || (currentUser?.groups.includes('Finance Admin') ?? false);
  const isFinanceManager = superAdmin || (currentUser?.groups.includes('Finance Manager') ?? false);

  return (
    <>
      <div className="px-5 py-5 text-xl font-bold tracking-wide text-white">ORION</div>
      <nav className="mt-2 flex-1 overflow-y-auto px-3">
        <NavSection label="Project Profile">
          <NavItem to="/projects" end onNavigate={onNavigate}>
            Project Profile
          </NavItem>
          <NavItem to="/projects/requests" onNavigate={onNavigate}>
            Project Profile Request
          </NavItem>
        </NavSection>

        <NavSection label="Medium Term Projection">
          <NavItem to="/mtp/budget-line-item" onNavigate={onNavigate}>
            Budget Line Item
          </NavItem>
          <NavItem to="/mtp/variance" onNavigate={onNavigate}>
            MTP Variance
          </NavItem>
          <NavItem to="/mtp/review-phase" onNavigate={onNavigate}>
            Review Phase
          </NavItem>
          {isFinanceManager && (
            <>
              <NavItem to="/mtp/clarification-fo" onNavigate={onNavigate}>
                Clarification (FO)
              </NavItem>
              <NavItem to="/mtp/clarification-fm" onNavigate={onNavigate}>
                Clarification (FM)
              </NavItem>
            </>
          )}
          <NavItem to="/mtp/approval-phase" onNavigate={onNavigate}>
            Approval Phase
          </NavItem>
          <NavItem to="/mtp/fin-supported" onNavigate={onNavigate}>
            Fin Supported
          </NavItem>
          <NavItem to="/mtp/inactive-users" onNavigate={onNavigate}>
            MTP with Inactive Users
          </NavItem>
        </NavSection>

        {isFinanceAdmin && (
          <NavSection label="Finance Admin">
            <NavItem to="/finance-admin/funding" onNavigate={onNavigate}>
              Source of Funding
            </NavItem>
            <NavItem to="/finance-admin/account" onNavigate={onNavigate}>
              Account
            </NavItem>
            <NavItem to="/finance-admin/cost-centre" onNavigate={onNavigate}>
              Cost Centre
            </NavItem>
            <NavItem to="/finance-admin/budget-period" onNavigate={onNavigate}>
              Budget Period
            </NavItem>
            <NavItem to="/finance-admin/inflation-rate" onNavigate={onNavigate}>
              Inflation Rate
            </NavItem>
          </NavSection>
        )}

        {superAdmin && (
          <NavSection label="IT Admin">
            <NavItem to="/it-admin/users" onNavigate={onNavigate}>
              User Management
            </NavItem>
          </NavSection>
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
