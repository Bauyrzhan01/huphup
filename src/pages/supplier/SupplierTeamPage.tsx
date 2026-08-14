import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import { PresenceDot } from '../../components/PresenceDot';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import { isUserOnline } from '../../utils/presence';
import type { Company, CompanyMember, CompanyMemberRole } from '../../types';

export function SupplierTeamPage() {
  const { t } = useTranslation();
  const { formatDate } = useAppLocale();
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  const isOwner = Boolean(company?.isOwner);

  const stats = useMemo(() => {
    const owners = members.filter(
      (m) => (m.role ?? (m.user.id === company?.ownerId ? 'OWNER' : 'MANAGER')) === 'OWNER',
    ).length;
    const managers = Math.max(0, members.length - owners);
    return {
      total: members.length,
      owners,
      managers,
      myRole: company?.myRole ?? (isOwner ? 'OWNER' : 'MANAGER'),
    };
  }, [members, company, isOwner]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const c = await companiesApi.me();
      setCompany(c);
      setMembers(c.members ?? (await companiesApi.members()));
    } catch {
      if (!silent) {
        setCompany(null);
        setMembers([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 40_000);
    return () => window.clearInterval(timer);
  }, []);

  const onlineCount = useMemo(
    () => members.filter((m) => isUserOnline(m.user.lastSeenAt)).length,
    [members],
  );

  async function createInvite() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const invite = await companiesApi.createInvite({ expiresInHours: 72 });
      const url = `${window.location.origin}${invite.urlPath}`;
      setInviteUrl(url);
      setInviteExpiresAt(invite.expiresAt);
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

  function memberRole(m: CompanyMember): CompanyMemberRole {
    return m.role ?? (m.user.id === company?.ownerId ? 'OWNER' : 'MANAGER');
  }

  return (
    <SupplierLayout crumb={t('team.crumb')}>
      <div className="page team-page">
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
          {company ? (
            <Link className="ghost" to="/supplier/company">
              {t('team.toCompany')}
            </Link>
          ) : null}
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

            <div className="supplier-profile-stats team-stats">
              <div className="supplier-profile-stat">
                <small>{t('team.statTotal')}</small>
                <b>{stats.total}</b>
              </div>
              <div className="supplier-profile-stat">
                <small>{t('team.statOnline')}</small>
                <b>{onlineCount}</b>
              </div>
              <div className="supplier-profile-stat">
                <small>{t('team.statManagers')}</small>
                <b>{stats.managers}</b>
              </div>
              <div className="supplier-profile-stat">
                <small>{t('team.statMyRole')}</small>
                <b>
                  {stats.myRole === 'OWNER'
                    ? t('team.roleOwner')
                    : t('team.roleManager')}
                </b>
              </div>
            </div>

            <div className="team-layout">
              <div className="team-main">
                {isOwner ? (
                  <section className="panel team-invite-card">
                    <div className="team-invite-head">
                      <div>
                        <div className="section-title">{t('team.inviteTitle')}</div>
                        <p className="meta team-invite-lead">{t('team.inviteHint')}</p>
                      </div>
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() => void createInvite()}
                      >
                        {busy ? t('common.loading') : t('team.createInvite')}
                      </button>
                    </div>

                    <ol className="team-invite-steps">
                      <li>{t('team.inviteStep1')}</li>
                      <li>{t('team.inviteStep2')}</li>
                      <li>{t('team.inviteStep3')}</li>
                    </ol>

                    {inviteUrl ? (
                      <div className="team-invite-result">
                        <div className="team-invite-meta">
                          <span className="chip soft">{t('team.inviteActive')}</span>
                          {inviteExpiresAt ? (
                            <span className="meta">
                              {t('team.inviteExpiresAt', {
                                date: formatDateTime(inviteExpiresAt),
                              })}
                            </span>
                          ) : null}
                        </div>
                        <div className="team-invite-link">{inviteUrl}</div>
                        <div className="actions" style={{ marginTop: 12 }}>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void copyInvite()}
                          >
                            {t('team.copyLink')}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy}
                            onClick={() => void createInvite()}
                          >
                            {t('team.createAnother')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="meta team-invite-empty">{t('team.inviteEmpty')}</p>
                    )}
                  </section>
                ) : (
                  <div className="notice" style={{ marginBottom: 18 }}>
                    {t('team.managerHint')}
                  </div>
                )}

                <section className="panel team-members-card">
                  <div className="team-members-head">
                    <div className="section-title">{t('team.membersTitle')}</div>
                    <span className="meta">
                      {t('team.membersCount', { count: members.length })}
                    </span>
                  </div>

                  <div className="team-member-list">
                    {members.map((m) => {
                      const role = memberRole(m);
                      const isYou = m.user.id === user?.id;
                      const canRemove =
                        isOwner &&
                        role !== 'OWNER' &&
                        m.user.id !== user?.id &&
                        m.user.id !== company.ownerId;
                      const joinedAt = m.createdAt ?? m.user.createdAt;
                      return (
                        <article key={m.id} className="team-member-card">
                          <div className="team-member-avatar-wrap">
                            <UserAvatar
                              name={m.user.fullName}
                              avatarUrl={m.user.avatarUrl}
                              className="team-member-avatar"
                            />
                            <PresenceDot lastSeenAt={m.user.lastSeenAt} />
                          </div>
                          <div className="team-member-body">
                            <div className="team-member-top">
                              <div className="team-member-name-row">
                                <b>{m.user.fullName}</b>
                                {isYou ? (
                                  <span className="chip soft">{t('team.you')}</span>
                                ) : null}
                                <PresenceDot
                                  lastSeenAt={m.user.lastSeenAt}
                                  showLabel
                                  className="team-member-presence"
                                />
                              </div>
                              <span className={`badge ${role === 'OWNER' ? 'amber' : 'blue'}`}>
                                {role === 'OWNER'
                                  ? t('team.roleOwner')
                                  : t('team.roleManager')}
                              </span>
                            </div>
                            <div className="team-member-meta">
                              <span>{m.user.email}</span>
                              {m.user.phone ? <span>{m.user.phone}</span> : null}
                              {m.title ? <span>{m.title}</span> : null}
                            </div>
                            <div className="team-member-foot">
                              <span className="meta">
                                {joinedAt
                                  ? t('team.joinedAt', { date: formatDate(joinedAt) })
                                  : t('team.joinedUnknown')}
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
                        </article>
                      );
                    })}
                    {members.length === 0 ? (
                      <div className="team-empty">
                        <b>{t('team.emptyMembers')}</b>
                        <p>{t('team.emptyMembersHint')}</p>
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <aside className="team-side">
                <section className="panel">
                  <div className="section-title">{t('team.companyCard')}</div>
                  <dl className="supplier-profile-dl">
                    <div>
                      <dt>{t('team.companyName')}</dt>
                      <dd>{company.name}</dd>
                    </div>
                    <div>
                      <dt>{t('team.companyCity')}</dt>
                      <dd>{company.city || t('common.empty')}</dd>
                    </div>
                    <div>
                      <dt>{t('team.companyVerified')}</dt>
                      <dd>
                        {company.verified
                          ? t('suppliers.verified')
                          : t('team.notVerified')}
                      </dd>
                    </div>
                    {company.createdAt ? (
                      <div>
                        <dt>{t('team.companySince')}</dt>
                        <dd>{formatDate(company.createdAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </section>

                <section className="panel">
                  <div className="section-title">{t('team.rolesTitle')}</div>
                  <div className="team-role-blocks">
                    <div className="team-role-block">
                      <span className="badge amber">{t('team.roleOwner')}</span>
                      <p>{t('team.roleOwnerHint')}</p>
                    </div>
                    <div className="team-role-block">
                      <span className="badge blue">{t('team.roleManager')}</span>
                      <p>{t('team.roleManagerHint')}</p>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </SupplierLayout>
  );
}
