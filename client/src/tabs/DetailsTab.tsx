import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, Field, inputCls, selectCls, StatusBadge, textareaCls } from '../components/ui';
import { usePersona } from '../PersonaContext';
import type { Project } from '../types';

export function DetailsTab({ project, onChange }: { project: Project; onChange: () => void }) {
  const { currentPersona, personas } = usePersona();
  const [form, setForm] = useState(project);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(project), [project]);

  const isOwningBranchRep = currentPersona?.roleType === 'Branch Rep' && currentPersona.dept === project.openedByDept;
  const isFinance = currentPersona?.roleType === 'Fin Officer' || currentPersona?.roleType === 'Fin Manager';
  const branchRepEditable = isOwningBranchRep && project.status === 'Draft';
  const financeEditable = isFinance && project.status === 'Request to Create';
  const financeOfficers = personas.filter((p) => p.roleType === 'Fin Officer');

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

  return (
    <Card className="max-w-3xl p-6">
      <div className="grid grid-cols-2 gap-5">
        <Field label="Status">
          <div>
            <StatusBadge status={project.status} />
          </div>
        </Field>

        <div className="col-span-2">
          <Field label="Project Title">
            <input
              className={inputCls}
              value={form.title}
              disabled={!branchRepEditable}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Justification of Expenditure">
            <textarea
              className={textareaCls}
              value={form.justification}
              disabled={!branchRepEditable}
              onChange={(e) => setForm({ ...form, justification: e.target.value })}
            />
          </Field>
        </div>
        <div className="col-span-2">
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
            {financeOfficers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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

      <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4">
        {dirty && (branchRepEditable || financeEditable) && (
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        )}
        {isOwningBranchRep && project.status === 'Draft' && (
          <Button variant="secondary" onClick={submitRequest}>
            Submit Request to Create
          </Button>
        )}
        {isFinance && project.status === 'Request to Create' && (
          <Button variant="secondary" onClick={approve}>
            Approve &amp; Activate
          </Button>
        )}
      </div>
    </Card>
  );
}
