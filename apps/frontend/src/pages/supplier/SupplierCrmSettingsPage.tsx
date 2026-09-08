import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { crmApi } from '../../api';
import { SupplierLayout } from '../../layouts/AppLayouts';
import type { CrmAutomationRule, CrmStage } from '../../types';

export function SupplierCrmSettingsPage() {
  const { t } = useTranslation();
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [rules, setRules] = useState<CrmAutomationRule[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([crmApi.stages(), crmApi.automation()])
      .then(([s, r]) => {
        setStages(s);
        setRules(r);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function saveStages() {
    setBusy(true);
    setError('');
    try {
      const updated = await crmApi.updateStages(
        stages.map((s, i) => ({
          status: s.status,
          label: s.label,
          sortOrder: i,
          color: s.color ?? undefined,
        })),
      );
      setStages(updated);
      setMsg(t('supplier.crmStagesSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(id: string, enabled: boolean) {
    const next = rules.map((r) => (r.id === id ? { ...r, enabled } : r));
    setRules(next);
    try {
      await crmApi.updateAutomation(next.map((r) => ({ id: r.id, enabled: r.enabled })));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <SupplierLayout crumb={t('supplier.crmSettings')}>
      <div className="page">
        <Link className="ghost" to="/supplier/deals" style={{ marginBottom: 16, display: 'inline-block' }}>
          ← {t('supplier.dealsTitle')}
        </Link>
        <div className="page-head">
          <div>
            <h1>{t('supplier.crmSettings')}</h1>
            <p>{t('supplier.crmSettingsHint')}</p>
          </div>
        </div>

        {error ? <p className="notice is-error">{error}</p> : null}
        {msg ? <p className="notice">{msg}</p> : null}

        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>{t('supplier.crmStagesTitle')}</h3>
          <div className="crm-stages-editor">
            {stages.map((stage, index) => (
              <div key={stage.status} className="crm-stage-row">
                <span className="meta">{index + 1}</span>
                <input
                  value={stage.label}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((s) =>
                        s.status === stage.status ? { ...s, label: e.target.value } : s,
                      ),
                    )
                  }
                />
                <input
                  type="color"
                  value={stage.color ?? '#666666'}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((s) =>
                        s.status === stage.status ? { ...s, color: e.target.value } : s,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <button type="button" className="primary" disabled={busy} onClick={() => void saveStages()}>
            {t('common.save')}
          </button>
        </div>

        <div className="panel">
          <h3>{t('supplier.crmAutomationTitle')}</h3>
          <ul className="crm-automation-list">
            {rules.map((rule) => (
              <li key={rule.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => void toggleRule(rule.id, e.target.checked)}
                  />
                  {t(`supplier.auto_${rule.trigger}`, {
                    hours: (rule.config as { hours?: number })?.hours ?? 24,
                  })}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SupplierLayout>
  );
}
