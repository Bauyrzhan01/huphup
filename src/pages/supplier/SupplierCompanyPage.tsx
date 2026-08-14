import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import { SupplierLayout } from '../../layouts/AppLayouts';
import type { Company } from '../../types';

const CATEGORY_OPTIONS = [
  'Стройматериалы',
  'Отделочные материалы',
  'Металлопрокат',
  'Электрика',
  'Сантехника',
  'Инструменты',
  'Логистика',
];

export function SupplierCompanyPage() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [bin, setBin] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [logoSaving, setLogoSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void companiesApi
      .me()
      .then((c) => {
        setCompany(c);
        setName(c.name);
        setBin(c.bin ?? '');
        setCity(c.city ?? '');
        setDescription(c.description ?? '');
        setCategories(c.categories ?? []);
      })
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, []);

  async function onLogoPick(files: FileList | null) {
    const file = files?.[0];
    if (!file || logoSaving || !company) return;
    setError('');
    setMsg('');
    setLogoSaving(true);
    try {
      const updated = await companiesApi.uploadLogo(file);
      setCompany(updated);
      setMsg(t('supplier.logoSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLogoSaving(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function onLogoRemove() {
    if (logoSaving || !company?.logoUrl) return;
    setError('');
    setMsg('');
    setLogoSaving(true);
    try {
      const updated = await companiesApi.removeLogo();
      setCompany(updated);
      setMsg(t('supplier.logoRemoved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLogoSaving(false);
    }
  }

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const body = {
        name,
        bin: bin || undefined,
        city: city || undefined,
        description: description || undefined,
        categories,
      };
      if (company) {
        const updated = await companiesApi.update(company.id, body);
        setCompany(updated);
        setMsg(t('supplier.saved'));
      } else {
        const created = await companiesApi.create(body);
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
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('supplier.companyTitle')}</h1>
            <p>
              {loading
                ? t('common.loading')
                : company
                  ? t('supplier.companyExists')
                  : t('supplier.companyEmpty')}
            </p>
          </div>
        </div>
        {!loading ? (
          <form className="panel" onSubmit={onSubmit}>
            <div className="form-grid">
              {company ? (
                <div className="field full">
                  <label>{t('supplier.logo')}</label>
                  <div className="account-profile-avatar-block">
                    <UserAvatar
                      name={name || company.name}
                      avatarUrl={company.avatarUrl || company.logoUrl}
                      className="supplier-directory-avatar"
                    />
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => void onLogoPick(e.target.files)}
                    />
                    <div className="account-profile-avatar-actions">
                      <button
                        type="button"
                        className="ghost"
                        disabled={logoSaving}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoSaving
                          ? t('supplier.logoUploading')
                          : t('supplier.logoUpload')}
                      </button>
                      {company.logoUrl ? (
                        <button
                          type="button"
                          className="ghost"
                          disabled={logoSaving}
                          onClick={() => void onLogoRemove()}
                        >
                          {t('supplier.logoRemove')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="meta" style={{ margin: '8px 0 0' }}>
                    {t('supplier.logoHint')}
                  </p>
                </div>
              ) : null}
              <div className="field full">
                <label>{t('supplier.companyName')}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="field">
                <label>{t('supplier.companyBin')}</label>
                <input
                  value={bin}
                  onChange={(e) => setBin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="123456789012"
                  inputMode="numeric"
                />
              </div>
              <div className="field">
                <label>{t('supplier.companyCity')}</label>
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">{t('common.empty')}</option>
                  <option value="Алматы">Алматы</option>
                  <option value="Астана">Астана</option>
                  <option value="Шымкент">Шымкент</option>
                </select>
              </div>
              <div className="field full">
                <label>{t('supplier.companyCategories')}</label>
                <p className="meta" style={{ margin: '0 0 8px' }}>
                  {t('supplier.companyCategoriesHint')}
                </p>
                <div className="category-picks">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`chip pick${categories.includes(cat) ? ' is-on' : ''}`}
                      onClick={() => toggleCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
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
                {company ? t('common.save') : t('common.create')}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </SupplierLayout>
  );
}
