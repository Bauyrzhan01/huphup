import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { LeadTask } from '../../types';

type Props = {
  tasks: LeadTask[];
  busy?: boolean;
  onAdd: (input: { title: string; kind: LeadTask['kind']; dueAt: string }) => Promise<void>;
  onDone: (taskId: string) => Promise<void>;
};

export function LeadTasksPanel({ tasks, busy, onAdd, onDone }: Props) {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<LeadTask['kind']>('TASK');
  const [dueAt, setDueAt] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !dueAt) return;
    await onAdd({
      title: title.trim(),
      kind,
      dueAt: new Date(dueAt).toISOString(),
    });
    setTitle('');
  }

  const open = tasks.filter((x) => !x.doneAt);
  const done = tasks.filter((x) => x.doneAt);

  return (
    <section className="lead-tasks-panel">
      <h4>{t('supplier.tasksTitle')}</h4>
      <form className="lead-tasks-form" onSubmit={(e) => void submit(e)}>
        <select value={kind} onChange={(e) => setKind(e.target.value as LeadTask['kind'])}>
          <option value="CALL">{t('supplier.taskCall')}</option>
          <option value="MEETING">{t('supplier.taskMeeting')}</option>
          <option value="TASK">{t('supplier.taskTodo')}</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('supplier.taskPlaceholder')}
          required
        />
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
        <button type="submit" className="ghost" disabled={busy}>
          {t('supplier.taskAdd')}
        </button>
      </form>
      <ul className="lead-tasks-list">
        {open.map((task) => (
          <li
            key={task.id}
            className={new Date(task.dueAt).getTime() < Date.now() ? 'is-overdue' : undefined}
          >
            <div>
              <b>{task.title}</b>
              <p className="meta">
                {t(`supplier.taskKind.${task.kind}`)} · {formatDateTime(task.dueAt)}
                {task.assignee?.fullName ? ` · ${task.assignee.fullName}` : ''}
              </p>
            </div>
            <button type="button" className="ghost" disabled={busy} onClick={() => void onDone(task.id)}>
              {t('supplier.taskDone')}
            </button>
          </li>
        ))}
        {done.slice(0, 3).map((task) => (
          <li key={task.id} className="is-done">
            <div>
              <b>{task.title}</b>
              <p className="meta">{t('supplier.taskClosed')}</p>
            </div>
          </li>
        ))}
        {!tasks.length ? <li className="meta">{t('supplier.taskEmpty')}</li> : null}
      </ul>
    </section>
  );
}
