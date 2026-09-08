import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '../UserAvatar';
import { PresenceDot } from '../PresenceDot';
import type { CrmStage, Lead } from '../../types';

type Props = {
  stages: CrmStage[];
  columns: Record<string, Lead[]>;
  loading: boolean;
  onDrop: (leadId: string, status: string) => void;
  formatDate: (iso: string) => string;
};

export function CrmKanbanBoard({
  stages,
  columns,
  loading,
  onDrop,
  formatDate,
}: Props) {
  const { t } = useTranslation();

  function onDragStart(e: React.DragEvent, leadId: string) {
    e.dataTransfer.setData('text/lead-id', leadId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/lead-id');
    if (leadId) onDrop(leadId, status);
  }

  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="kanban kanban-crm kanban-dnd">
      {ordered.map((stage) => {
        const items = columns[stage.status] ?? [];
        return (
          <div
            key={stage.status}
            className="column crm-col"
            onDragOver={onDragOver}
            onDrop={(e) => handleDrop(e, stage.status)}
          >
            <div className="column-head">
              <b style={stage.color ? { color: stage.color } : undefined}>{stage.label}</b>
              <span className="count">{items.length}</span>
            </div>
            {items.map((lead) => (
              <div
                key={lead.id}
                className={`deal deal-draggable${lead.idleState ? ` is-${lead.idleState}` : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, lead.id)}
              >
                <Link className="deal-link-inner" to={`/supplier/leads?leadId=${lead.id}`}>
                  <div className="deal-top">
                    <span className="lead-code">{lead.request.code}</span>
                    <span className="deal-date">{formatDate(lead.createdAt)}</span>
                  </div>
                  {lead.idleState ? (
                    <span className={`deal-idle-badge is-${lead.idleState}`}>
                      {lead.idleState === 'overdue'
                        ? t('supplier.badgeOverdue')
                        : lead.idleState === 'unassigned'
                          ? t('supplier.needsManager')
                          : t('supplier.badgeIdle')}
                    </span>
                  ) : null}
                  <div className="deal-title">{lead.request.title}</div>
                  {lead.matchReason ? (
                    <p className="deal-match-reason">{lead.matchReason}</p>
                  ) : null}
                  {lead.nextStepText ? (
                    <p className="deal-next-step">
                      {lead.nextStepText}
                      {lead.nextStepAt ? ` · ${formatDate(lead.nextStepAt)}` : ''}
                    </p>
                  ) : null}
                  <div className="deal-assignee">
                    {lead.assignee ? (
                      <>
                        <span className="deal-assignee-avatar-wrap">
                          <UserAvatar
                            name={lead.assignee.fullName}
                            avatarUrl={lead.assignee.avatarUrl}
                            className="deal-assignee-avatar"
                          />
                          <PresenceDot lastSeenAt={lead.assignee.lastSeenAt} />
                        </span>
                        <span>{lead.assignee.fullName}</span>
                      </>
                    ) : (
                      <span className="deal-unassigned">{t('supplier.needsManager')}</span>
                    )}
                  </div>
                </Link>
              </div>
            ))}
            {!loading && items.length === 0 ? (
              <p className="kanban-empty">{t('supplier.kanbanEmpty')}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
