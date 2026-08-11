import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { SupplierLayout } from '../../layouts/AppLayouts';
import type { Company } from '../../types';

export function SupplierCompanyPage() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void companiesApi
      .me()
      .then((c) => {
        setCompany(c);
        setName(c.name);
        setCity(c.city ?? '');
        setDescription(c.description ?? '');
      })
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      if (company) {
        const updated = await companiesApi.update(company.id, {
          name,
          city: city || undefined,
          description: description || undefined,
        });
        setCompany(updated);
        setMsg(t('supplier.saved'));
      } else {
        const created = await companiesApi.create({
          name,
          city: city || undefined,
          description: description || undefined,
        });
        setCompany(created);
        setMsg(t('supplier.created'));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <SupplierLayout crumb={t('supplier.companyCrumb')}>
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1>{t('supplier.companyTitle')}</h1>
            <p>
              {loading
                ? t('supplier.companyLoading')
                : company
                  ? `ID: ${company.id}`
                  : t('supplier.companyEmpty')}
            </p>
          </div>
        </div>
        {!loading ? (
          <form className="panel" onSubmit={onSubmit}>
            <div className="form-grid">
              <div className="field full">
                <label>{t('supplier.companyName')}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="field">
                <label>{t('supplier.companyCity')}</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Алматы"
                  list="cities"
                />
                <datalist id="cities">
                  <option value="Алматы" />
                  <option value="Астана" />
                  <option value="Шымкент" />
                </datalist>
              </div>
              <div className="field full">
                <label>{t('supplier.companyDescription')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            {error ? (
              <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
                {error}
              </p>
            ) : null}
            {msg ? <p className="notice" style={{ marginTop: 12 }}>{msg}</p> : null}
            <div className="actions">
              <button className="primary">
                {company ? t('supplier.saveToDb') : t('supplier.createInDb')}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </SupplierLayout>
  );
}
