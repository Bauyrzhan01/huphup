import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Lead } from '../../types';

type Props = {
  leads: Lead[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  formatDateTime: (iso: string) => string;
  stageLabel: (status: string) => string;
};

export function CrmListView({
  leads,
  selectedIds,
  onToggle,
  onToggleAll,
  formatDateTime,
  stageLabel,
}: Props) {
  const { t } = useTranslation();
  const allSelected = leads.length > 0 && selectedIds.length === leads.length;

  return (
    <div className="crm-list-view">
      <table className="crm-list-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label={t('supplier.selectAll')}
              />
            </th>
            <th>{t('supplier.listCode')}</th>
            <th>{t('supplier.listTitle')}</th>
            <th>{t('supplier.listStage')}</th>
            <th>{t('supplier.listAssignee')}</th>
            <th>{t('supplier.matchScore')}</th>
            <th>{t('supplier.receivedAt')}</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className={lead.idleState ? `is-${lead.idleState}` : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(lead.id)}
                  onChange={() => onToggle(lead.id)}
                  aria-label={lead.request.code}
                />
              </td>
              <td>
                <Link to={`/supplier/leads?leadId=${lead.id}`}>{lead.request.code}</Link>
              </td>
              <td>{lead.request.title}</td>
              <td>{stageLabel(lead.status)}</td>
              <td>{lead.assignee?.fullName ?? t('supplier.unassigned')}</td>
              <td>{Math.round(lead.score)}</td>
              <td>{formatDateTime(lead.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
