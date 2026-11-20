import type { ButtonHTMLAttributes, ReactNode } from 'react';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-200 text-slate-700',
  Pending: 'bg-amber-100 text-amber-800',
  Active: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-rose-100 text-rose-800',
  Inactive: 'bg-slate-200 text-slate-500',
  Pipeline: 'bg-amber-100 text-amber-800',
  Approved: 'bg-emerald-100 text-emerald-800',
  Review: 'bg-amber-100 text-amber-800',
  Clarification: 'bg-sky-100 text-sky-800',
  'Pending Approval': 'bg-violet-100 text-violet-800',
  Open: 'bg-emerald-100 text-emerald-800',
  'Closed for Submission': 'bg-amber-100 text-amber-800',
  'Closed and Locked': 'bg-rose-100 text-rose-800',
  Required: 'bg-rose-100 text-rose-800',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-slate-200 text-slate-700';
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const base = 'rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 transition-colors';
  const variants: Record<string, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'text-indigo-600 hover:bg-indigo-50',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400';
export const selectCls = inputCls;
export const textareaCls = `${inputCls} min-h-20`;

export function currency(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
