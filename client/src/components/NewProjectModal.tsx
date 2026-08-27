import { useState } from 'react';
import { api } from '../api';
import { Button, Field, inputCls, textareaCls } from './ui';

export function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!title.trim() || !justification.trim()) {
      setError('Project Title and Justification of Expenditure are required.');
      return;
    }
    setSaving(true);
    try {
      const project = await api.projects.create({ title, justification });
      onCreated(project.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-800">New Project Profile</h2>
        <p className="mt-1 text-sm text-slate-500">
          Starts in <span className="font-medium">Draft</span> status. You can complete the remaining details after creation.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Project Title">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
          <Field label="Justification of Expenditure">
            <textarea className={textareaCls} value={justification} onChange={(e) => setJustification(e.target.value)} />
          </Field>
          {error && <div className="text-sm text-rose-600">{error}</div>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
