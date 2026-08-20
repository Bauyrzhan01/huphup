import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { crmApi, healthApi } from '../../api';
import { SupplierDashboard } from '../../components/crm/SupplierDashboard';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { mapApiError } from '../../utils/apiErrors';
import type { ApiHealth, CrmAnalytics, CrmLivePulse } from '../../types';

export function SupplierDashboardPage() {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<CrmAnalytics | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [live, setLive] = useState<CrmLivePulse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [analyticsRes, healthRes, liveRes] = await Promise.allSettled([
        crmApi.analytics(),
        healthApi.check(),
        crmApi.live(),
      ]);
      if (cancelled) return;

      if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (liveRes.status === 'fulfilled') setLive(liveRes.value);

      const fail =
        analyticsRes.status === 'rejected'
          ? analyticsRes.reason
          : liveRes.status === 'rejected'
            ? liveRes.reason
            : null;
      setError(fail ? mapApiError(fail, t) : '');
    };

    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [t]);

  return (
    <SupplierLayout
      crumb={t('nav.dashboard')}
      title={t('nav.dashboard')}
      actions={
        <div className="crm-head-actions">
          <Link className="ghost" to="/supplier/deals">
            {t('supplier.dealsTitle')}
          </Link>
          <Link className="ghost" to="/supplier/leads">
            {t('supplier.newLeadsAction')}
          </Link>
        </div>
      }
    >
      <div className="page">
        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        <SupplierDashboard analytics={analytics} health={health} live={live} />
      </div>
    </SupplierLayout>
  );
}
