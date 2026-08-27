import type { BudgetKind, BudgetLine, FundingEntry, Persona, Project, TeamMember } from './types';

let currentPersonaId: string | null = null;

export function setApiPersona(id: string | null) {
  currentPersonaId = id;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(currentPersonaId ? { 'x-persona-id': currentPersonaId } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  personas: {
    list: () => request<Persona[]>('GET', '/personas'),
  },
  projects: {
    list: () => request<Project[]>('GET', '/projects'),
    get: (id: string) => request<Project>('GET', `/projects/${id}`),
    create: (data: { title: string; justification: string; additionalComments?: string }) =>
      request<Project>('POST', '/projects', data),
    update: (id: string, data: Partial<Project>) => request<Project>('PATCH', `/projects/${id}`, data),
    submitRequest: (id: string) => request<Project>('POST', `/projects/${id}/submit-request`),
    approve: (id: string) => request<Project>('POST', `/projects/${id}/approve`),
  },
  funding: {
    list: (projectId: string) => request<FundingEntry[]>('GET', `/projects/${projectId}/funding`),
    create: (projectId: string, sourceOfFunding: string) =>
      request<FundingEntry>('POST', `/projects/${projectId}/funding`, { sourceOfFunding }),
    update: (id: string, data: Partial<FundingEntry>) => request<FundingEntry>('PATCH', `/funding/${id}`, data),
    approve: (id: string, fundingPotId: string) =>
      request<FundingEntry>('POST', `/funding/${id}/approve`, { fundingPotId }),
    remove: (id: string) => request<void>('DELETE', `/funding/${id}`),
  },
  budgetLines: {
    list: (projectId: string, kind: BudgetKind) =>
      request<BudgetLine[]>('GET', `/projects/${projectId}/budget-lines?kind=${kind}`),
    create: (projectId: string, kind: BudgetKind, origin: 'new' | 'carried_forward' = 'new') =>
      request<BudgetLine>('POST', `/projects/${projectId}/budget-lines`, { kind, origin }),
    update: (id: string, data: Partial<BudgetLine>) => request<BudgetLine>('PATCH', `/budget-lines/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/budget-lines/${id}`),
    submit: (id: string) => request<BudgetLine>('POST', `/budget-lines/${id}/submit`),
    approve: (id: string) => request<BudgetLine>('POST', `/budget-lines/${id}/approve`),
    return: (id: string, note?: string) => request<BudgetLine>('POST', `/budget-lines/${id}/return`, { note }),
  },
  teamMembers: {
    list: (projectId: string) => request<TeamMember[]>('GET', `/projects/${projectId}/team-members`),
    create: (projectId: string, personaId: string) =>
      request<TeamMember>('POST', `/projects/${projectId}/team-members`, { personaId }),
    remove: (id: string) => request<void>('DELETE', `/team-members/${id}`),
  },
};
