import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Button, Card, Field, inputCls, selectCls, StatusBadge, textareaCls } from '../components/ui';
import { isFinance as isFinanceUser, isOwningBranchRep } from '../lib/workflow';
import type { Project } from '../types';

export function DetailsTab({ project, onChange }: { project: Project; onChange: () => void }) {
  const { currentUser, users } = useAuth();
  const [form, setForm] = useState(project);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(project), [project]);

  const branchRepOwner = !!currentUser && isOwningBranchRep(currentUser, project);
  const isFinance = !!currentUser && isFinanceUser(currentUser);
  // Branch Rep can keep editing title/justification/comments while Pending
  // (awaiting Finance approval), not just Draft/Rejected — the Submit button
  // below is gated separately so a Pending request can't be re-submitted.
  const editableStatus = project.status === 'Draft' || project.status === 'Rejected';
  const branchRepEditable = branchRepOwner && (editableStatus || project.status === 'Pending');
  const financeEditable = isFinance && project.status === 'Pending';
  // Finance Officer dropdown includes everyone in either the Finance Officer
  // or Finance Manager group, not scoped to a department.
  const financeOfficers = users.filter((u) => u.groups.includes('Finance Officer') || u.groups.includes('Finance Manager'));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  const dirty = JSON.stringify(form) !== JSON.stringify(project);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.projects.update(project.id, {
        title: form.title,
        justification: form.justification,
        additionalComments: form.additionalComments,
        subAccount: form.subAccount,
        developmentCostCentre: form.developmentCostCentre,
        operatingCostCentre: form.operatingCostCentre,
        financeOfficerId: form.financeOfficerId,
      });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest() {
    setError(null);
    try {
      await api.projects.submitRequest(project.id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function approve() {
    setError(null);
    try {
      await api.projects.approve(project.id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reject() {
    setError(null);
    try {
      await api.projects.reject(project.id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="max-w-3xl p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Status">
          <div>
            <StatusBadge status={project.status} />
          </div>
        </Field>
        {project.status === 'Active' && project.financeOfficerId && (
          <Field label="Finance Officer in Charge">
            <div className="text-sm text-slate-700">{nameOf(project.financeOfficerId)}</div>
          </Field>
        )}

        <div className="sm:col-span-2">
          <Field label="Project Title">
            <input
              className={inputCls}
              value={form.title}
              disabled={!branchRepEditable}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Justification of Expenditure">
            <textarea
              className={textareaCls}
              value={form.justification}
              disabled={!branchRepEditable}
              onChange={(e) => setForm({ ...form, justification: e.target.value })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Additional Comments" hint="Optional">
            <textarea
              className={textareaCls}
              value={form.additionalComments}
              disabled={!branchRepEditable}
              onChange={(e) => setForm({ ...form, additionalComments: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Sub Account" hint="Filled in by Finance once routed">
          <input
            className={inputCls}
            value={form.subAccount}
            disabled={!financeEditable}
            onChange={(e) => setForm({ ...form, subAccount: e.target.value })}
          />
        </Field>
        <Field label="Finance Officer" hint="Filled in by Finance once routed">
          <select
            className={selectCls}
            value={form.financeOfficerId ?? ''}
            disabled={!financeEditable}
            onChange={(e) => setForm({ ...form, financeOfficerId: e.target.value || null })}
          >
            <option value="">Select&hellip;</option>
            {financeOfficers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Development Cost Centre" hint="Filled in by Finance once routed">
          <input
            className={inputCls}
            value={form.developmentCostCentre}
            disabled={!financeEditable}
            onChange={(e) => setForm({ ...form, developmentCostCentre: e.target.value })}
          />
        </Field>
        <Field label="Operating Cost Centre" hint="Filled in by Finance once routed">
          <input
            className={inputCls}
            value={form.operatingCostCentre}
            disabled={!financeEditable}
            onChange={(e) => setForm({ ...form, operatingCostCentre: e.target.value })}
          />
        </Field>
      </div>

      {error && <div className="mt-4 text-sm text-rose-600">{error}</div>}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {dirty && (branchRepEditable || financeEditable) && (
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        )}
        {branchRepOwner && editableStatus && (
          <Button variant="secondary" onClick={submitRequest}>
            {project.status === 'Rejected' ? 'Resubmit Request to Create' : 'Submit Request to Create'}
          </Button>
        )}
        {isFinance && project.status === 'Pending' && (
          <>
            <Button variant="secondary" onClick={approve}>
              Approve &amp; Activate
            </Button>
            <Button variant="danger" onClick={reject}>
              Reject
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
