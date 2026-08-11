import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { SupplierLayout } from '../../layouts/AppLayouts';
import type { Company, CompanyMember } from '../../types';

export function SupplierTeamPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const isOwner = Boolean(company?.isOwner);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const c = await companiesApi.me();
      setCompany(c);
      setMembers(c.members ?? (await companiesApi.members()));
    } catch {
      setCompany(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createInvite() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const invite = await companiesApi.createInvite({ expiresInHours: 72 });
      const url = `${window.location.origin}${invite.urlPath}`;
      setInviteUrl(url);
      setMsg(t('team.inviteCreated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setMsg(t('team.copied'));
    } catch {
      setMsg(t('team.copyManual'));
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm(t('team.removeConfirm'))) return;
    setError('');
    try {
      await companiesApi.removeMember(userId);
      setMsg(t('team.removed'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <SupplierLayout crumb={t('team.crumb')}>
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('team.title')}</h1>
            <p>
              {loading
                ? t('common.loadingFromDb')
                : company
                  ? t('team.subtitle', { name: company.name, count: members.length })
                  : t('team.noCompany')}
            </p>
          </div>
        </div>

        {!company && !loading ? (
          <div className="notice">
            {t('team.noCompany')}{' '}
            <Link to="/supplier/company">{t('products.createCompany')}</Link>
          </div>
        ) : null}

        {company ? (
          <>
            {error ? (
              <p className="notice" style={{ color: '#b45309', marginBottom: 14 }}>
                {error}
              </p>
            ) : null}
            {msg ? <p className="notice" style={{ marginBottom: 14 }}>{msg}</p> : null}

            {isOwner ? (
              <div className="panel" style={{ marginBottom: 18 }}>
                <div className="section-title">{t('team.inviteTitle')}</div>
                <p className="meta" style={{ margin: '0 0 14px' }}>
                  {t('team.inviteHint')}
                </p>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => void createInvite()}
                  >
                    {busy ? t('common.loading') : t('team.createInvite')}
                  </button>
                  {inviteUrl ? (
                    <button type="button" className="ghost" onClick={() => void copyInvite()}>
                      {t('team.copyLink')}
                    </button>
                  ) : null}
                </div>
                {inviteUrl ? (
                  <div className="notice" style={{ marginTop: 14, wordBreak: 'break-all' }}>
                    {inviteUrl}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="notice" style={{ marginBottom: 18 }}>
                {t('team.managerHint')}
              </div>
            )}

            <h3 className="section-title">{t('team.membersTitle')}</h3>
            <div className="card request-list">
              {members.map((m) => {
                const role = m.role ?? (m.user.id === company.ownerId ? 'OWNER' : 'MANAGER');
                const canRemove =
                  isOwner &&
                  role !== 'OWNER' &&
                  m.user.id !== user?.id &&
                  m.user.id !== company.ownerId;
                return (
                  <div key={m.id} className="request-item">
                    <div>
                      <div className="request-title">{m.user.fullName}</div>
                      <div className="meta">
                        {m.user.email}
                        {m.title ? ` · ${m.title}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`badge ${role === 'OWNER' ? 'amber' : 'blue'}`}>
                        {role === 'OWNER' ? t('team.roleOwner') : t('team.roleManager')}
                      </span>
                      {canRemove ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void removeMember(m.user.id)}
                        >
                          {t('team.remove')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {members.length === 0 ? (
                <div className="request-item">
                  <div className="request-title">{t('team.emptyMembers')}</div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </SupplierLayout>
  );
}
