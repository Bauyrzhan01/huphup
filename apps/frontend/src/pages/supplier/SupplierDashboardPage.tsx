import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { crmApi } from '../../api';
import { SupplierDashboard } from '../../components/crm/SupplierDashboard';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { mapApiError } from '../../utils/apiErrors';
import type { CrmAnalytics } from '../../types';

export function SupplierDashboardPage() {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<CrmAnalytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void crmApi
      .analytics()
      .then(setAnalytics)
      .catch((err) => setError(mapApiError(err, t)));
  }, [t]);

  return (
    <SupplierLayout crumb={t('nav.dashboard')} title={t('nav.dashboard')}>
      <div className="page">
        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        <SupplierDashboard analytics={analytics} failed={Boolean(error)} />
      </div>
    </SupplierLayout>
  );
}
