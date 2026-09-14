import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, leadsApi } from '../../api';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAuth } from '../../auth/AuthContext';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { CompanyMember, Lead, LeadTask, LeadTaskComment } from '../../types';
import { mapApiError } from '../../utils/apiErrors';

const STATUSES: LeadTask['status'][] = ['TODO', 'IN_PROGRESS', 'DONE'];

export function SupplierTasksPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDateTime } = useAppLocale();
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [query, setQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected] = useState<LeadTask | null>(null);
  const [comments, setComments] = useState<LeadTaskComment[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leadId, setLeadId] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<LeadTask['kind']>('TASK');
  const [priority, setPriority] = useState<LeadTask['priority']>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [description, setDescription] = useState('');

  const refresh = useCallback(async () => {
    const [board, list, company] = await Promise.all([
      leadsApi.boardTasks(),
      leadsApi.list(),
      companiesApi.me().catch(() => null),
    ]);
    setTasks(board);
    setLeads(list);
    setMembers(company?.members ?? []);
    setSelected((prev) => (prev ? board.find((x) => x.id === prev.id) ?? prev : null));
  }, []);

  useEffect(() => {
    void refresh().catch((err) =>
      setError(mapApiError(err, t)),
    );
  }, [refresh, t]);

  useEffect(() => {
    if (!selected) {
      setComments([]);
      return;
    }
    void leadsApi
      .taskComments(selected.lead?.id ?? '', selected.id)
      .then(setComments)
      .catch(() => setComments([]));
  }, [selected]);

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (mineOnly && task.assignee?.id !== user?.id) return false;
      if (priorityFilter && task.priority !== priorityFilter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const hay = [
        task.code,
        task.title,
        task.description,
        task.assignee?.fullName,
        task.lead?.request.code,
        task.lead?.request.title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tasks, mineOnly, user?.id, priorityFilter, query]);

  async function onDrop(task: LeadTask, status: LeadTask['status']) {
    if (!task.lead?.id || task.status === status) return;
    setBusy(true);
    try {
      await leadsApi.updateTask(task.lead.id, task.id, { status });
      await refresh();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function createIssue(e: FormEvent) {
    e.preventDefault();
    if (!leadId || !title.trim() || !dueAt) return;
    setBusy(true);
    setError('');
    try {
      await leadsApi.addTask(leadId, {
        title: title.trim(),
        kind,
        dueAt: new Date(dueAt).toISOString(),
        priority,
        assigneeId: assigneeId || undefined,
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
      await refresh();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function saveSelected(body: {
    status?: LeadTask['status'];
    priority?: LeadTask['priority'];
    assigneeId?: string;
  }) {
    if (!selected?.lead?.id) return;
    setBusy(true);
    try {
      const updated = await leadsApi.updateTask(selected.lead.id, selected.id, body);
      setSelected(updated);
      await refresh();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (!selected?.lead?.id || !comment.trim()) return;
    setBusy(true);
    try {
      const created = await leadsApi.addTaskComment(selected.lead.id, selected.id, comment.trim());
      setComments((prev) => [...prev, created]);
      setComment('');
      await refresh();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  function onDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData('text/task-id', taskId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, status: LeadTask['status']) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/task-id');
    const task = tasks.find((x) => x.id === id);
    if (task) void onDrop(task, status);
  }

  return (
    <SupplierLayout crumb={t('nav.tasks')}>
      <div className="page crm-page">
        <form className="task-create-form" onSubmit={(e) => void createIssue(e)}>
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} required>
            <option value="">{t('supplier.taskPickLead')}</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.request.code} · {lead.request.title}
              </option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as LeadTask['kind'])}>
            <option value="TASK">{t('supplier.taskTodo')}</option>
            <option value="CALL">{t('supplier.taskCall')}</option>
            <option value="MEETING">{t('supplier.taskMeeting')}</option>
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
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{t('supplier.taskAssignMe')}</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.fullName}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('supplier.taskPlaceholder')}
            required
          />
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('supplier.taskDescription')}
          />
          <button type="submit" className="primary" disabled={busy}>
            {t('supplier.taskCreate')}
          </button>
        </form>

        <div className="crm-toolbar">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('supplier.taskSearch')}
          />
          <button
            type="button"
            className={`chip pick${mineOnly ? ' is-on' : ''}`}
            onClick={() => setMineOnly((v) => !v)}
          >
            {t('supplier.filterMine', { count: tasks.filter((x) => x.assignee?.id === user?.id).length })}
          </button>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">{t('supplier.taskAnyPriority')}</option>
            <option value="CRITICAL">{t('supplier.taskPriority.CRITICAL')}</option>
            <option value="HIGH">{t('supplier.taskPriority.HIGH')}</option>
            <option value="MEDIUM">{t('supplier.taskPriority.MEDIUM')}</option>
            <option value="LOW">{t('supplier.taskPriority.LOW')}</option>
          </select>
        </div>

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}

        <div className="kanban kanban-crm kanban-dnd">
          {STATUSES.map((status) => {
            const items = filtered.filter((task) => task.status === status);
            return (
              <div
                key={status}
                className="column crm-col"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => handleDrop(e, status)}
              >
                <div className="column-head">
                  <b>{t(`supplier.taskStatus.${status}`)}</b>
                  <span className="count">{items.length}</span>
                </div>
                {items.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className={`deal deal-draggable task-card is-${task.priority.toLowerCase()}${
                      !task.doneAt && new Date(task.dueAt).getTime() < Date.now() ? ' is-overdue' : ''
                    }`}
                    draggable
                    onDragStart={(e) => onDragStart(e, task.id)}
                    onClick={() => setSelected(task)}
                  >
                    <div className="deal-top">
                      <span className="lead-code">{task.code}</span>
                      <span className={`prio prio-${task.priority}`}>{t(`supplier.taskPriority.${task.priority}`)}</span>
                    </div>
                    <div className="deal-title">{task.title}</div>
                    <p className="meta">
                      {t(`supplier.taskKind.${task.kind}`)} · {task.lead?.request.code} · {formatDateTime(task.dueAt)}
                    </p>
                    <p className="meta">
                      {task.assignee?.fullName ?? t('supplier.needsManager')}
                      {task._count?.comments ? ` · ${task._count.comments}` : ''}
                    </p>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {selected ? (
          <aside className="task-drawer">
            <div className="task-drawer-head">
              <b>
                {selected.code} {selected.title}
              </b>
              <button type="button" className="ghost" onClick={() => setSelected(null)}>
                {t('common.cancel')}
              </button>
            </div>
            <p className="meta">
              <Link to={`/supplier/leads?leadId=${selected.lead?.id ?? ''}`}>
                {selected.lead?.request.code} · {selected.lead?.request.title}
              </Link>
            </p>
            {selected.description ? <p>{selected.description}</p> : null}
            <div className="task-drawer-row">
              <select
                value={selected.status}
                disabled={busy}
                onChange={(e) => void saveSelected({ status: e.target.value as LeadTask['status'] })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`supplier.taskStatus.${s}`)}
                  </option>
                ))}
              </select>
              <select
                value={selected.priority}
                disabled={busy}
                onChange={(e) => void saveSelected({ priority: e.target.value as LeadTask['priority'] })}
              >
                <option value="LOW">{t('supplier.taskPriority.LOW')}</option>
                <option value="MEDIUM">{t('supplier.taskPriority.MEDIUM')}</option>
                <option value="HIGH">{t('supplier.taskPriority.HIGH')}</option>
                <option value="CRITICAL">{t('supplier.taskPriority.CRITICAL')}</option>
              </select>
              <select
                value={selected.assignee?.id ?? ''}
                disabled={busy}
                onChange={(e) => void saveSelected({ assigneeId: e.target.value })}
              >
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.fullName}
                  </option>
                ))}
              </select>
            </div>
            <h4>{t('supplier.taskComments')}</h4>
            <ul className="task-comments">
              {comments.map((item) => (
                <li key={item.id}>
                  <b>{item.user.fullName}</b>
                  <span className="meta">{formatDateTime(item.createdAt)}</span>
                  <p>{item.body}</p>
                </li>
              ))}
              {!comments.length ? <li className="meta">{t('supplier.taskCommentsEmpty')}</li> : null}
            </ul>
            <form className="lead-note-form" onSubmit={(e) => void sendComment(e)}>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('supplier.taskCommentPlaceholder')}
                rows={3}
              />
              <button type="submit" className="ghost" disabled={busy}>
                {t('supplier.notesAdd')}
              </button>
            </form>
          </aside>
        ) : null}
      </div>
    </SupplierLayout>
  );
}
