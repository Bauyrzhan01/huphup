import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { CompanyMember, LeadTask } from '../../types';

type Props = {
  tasks: LeadTask[];
  members?: CompanyMember[];
  busy?: boolean;
  onAdd: (input: {
    title: string;
    kind: LeadTask['kind'];
    dueAt: string;
    priority: LeadTask['priority'];
    assigneeId?: string;
    description?: string;
  }) => Promise<void>;
  onUpdate: (taskId: string, body: { status?: LeadTask['status']; priority?: LeadTask['priority'] }) => Promise<void>;
};

export function LeadTasksPanel({ tasks, members, busy, onAdd, onUpdate }: Props) {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<LeadTask['kind']>('TASK');
  const [priority, setPriority] = useState<LeadTask['priority']>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !dueAt) return;
    await onAdd({
      title: title.trim(),
      kind,
      dueAt: new Date(dueAt).toISOString(),
      priority,
      assigneeId: assigneeId || undefined,
      description: description.trim() || undefined,
    });
    setTitle('');
    setDescription('');
  }

  const open = tasks.filter((x) => x.status !== 'DONE');
  const done = tasks.filter((x) => x.status === 'DONE');

  return (
    <section className="lead-tasks-panel">
      <h4>{t('supplier.tasksTitle')}</h4>
      <form className="lead-tasks-form" onSubmit={(e) => void submit(e)}>
        <select value={kind} onChange={(e) => setKind(e.target.value as LeadTask['kind'])}>
          <option value="CALL">{t('supplier.taskCall')}</option>
          <option value="MEETING">{t('supplier.taskMeeting')}</option>
          <option value="TASK">{t('supplier.taskTodo')}</option>
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as LeadTask['priority'])}
        >
          <option value="LOW">{t('supplier.taskPriority.LOW')}</option>
          <option value="MEDIUM">{t('supplier.taskPriority.MEDIUM')}</option>
          <option value="HIGH">{t('supplier.taskPriority.HIGH')}</option>
          <option value="CRITICAL">{t('supplier.taskPriority.CRITICAL')}</option>
        </select>
        {members?.length ? (
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{t('supplier.taskAssignMe')}</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.fullName}
              </option>
            ))}
          </select>
        ) : null}
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
        <input
          className="lead-field-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('supplier.taskPlaceholder')}
          required
        />
        <textarea
          className="lead-field-full"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('supplier.taskDescription')}
          rows={2}
        />
        <button type="submit" className="ghost lead-field-full" disabled={busy}>
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
              <b>
                <span className="lead-code">{task.code}</span> {task.title}
              </b>
              <p className="meta">
                {t(`supplier.taskKind.${task.kind}`)} · {t(`supplier.taskPriority.${task.priority}`)} ·{' '}
                {t(`supplier.taskStatus.${task.status}`)} · {formatDateTime(task.dueAt)}
                {task.assignee?.fullName ? ` · ${task.assignee.fullName}` : ''}
              </p>
            </div>
            <div className="lead-tasks-actions">
              {task.status === 'TODO' ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void onUpdate(task.id, { status: 'IN_PROGRESS' })}
                >
                  {t('supplier.taskStart')}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void onUpdate(task.id, { status: 'DONE' })}
              >
                {t('supplier.taskDone')}
              </button>
            </div>
          </li>
        ))}
        {done.slice(0, 3).map((task) => (
          <li key={task.id} className="is-done">
            <div>
              <b>
                <span className="lead-code">{task.code}</span> {task.title}
              </b>
              <p className="meta">{t('supplier.taskClosed')}</p>
            </div>
          </li>
        ))}
        {!tasks.length ? <li className="meta">{t('supplier.taskEmpty')}</li> : null}
      </ul>
    </section>
  );
}
