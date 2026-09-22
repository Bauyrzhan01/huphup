import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageUp, Pencil, Trash2 } from 'lucide-react';
import { bannersApi } from '../api';
import { ApiError, mediaUrl } from '../api/client';
import { isAuthError, useAuth } from '../auth/AuthContext';
import { ErrorNote, OkNote, formatDateTime } from '../components/ui';
import { BANNER_AUDIENCE_LABEL } from '../api/types';
import type { Banner, BannerAudience, BannerInput } from '../api/types';

type Draft = {
  title: string;
  subtitle: string;
  bgColor: string;
  ctaText: string;
  ctaUrl: string;
  audience: BannerAudience;
  cities: string;
  isActive: boolean;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY: Draft = {
  title: '',
  subtitle: '',
  bgColor: '#111111',
  ctaText: '',
  ctaUrl: '',
  audience: 'ALL',
  cities: '',
  isActive: true,
  sortOrder: '0',
  startsAt: '',
  endsAt: '',
};

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function draftFrom(b: Banner): Draft {
  return {
    title: b.title,
    subtitle: b.subtitle ?? '',
    bgColor: b.bgColor,
    ctaText: b.ctaText ?? '',
    ctaUrl: b.ctaUrl ?? '',
    audience: b.audience,
    cities: b.cities.join(', '),
    isActive: b.isActive,
    sortOrder: String(b.sortOrder),
    startsAt: toLocalInput(b.startsAt),
    endsAt: toLocalInput(b.endsAt),
  };
}

function inputFrom(d: Draft): BannerInput {
  return {
    title: d.title.trim(),
    subtitle: d.subtitle.trim() || null,
    ctaText: d.ctaText.trim() || null,
    ctaUrl: d.ctaUrl.trim() || null,
    audience: d.audience,
    cities: d.cities
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    isActive: d.isActive,
    sortOrder: Math.max(0, Math.trunc(Number(d.sortOrder)) || 0),
    startsAt: fromLocalInput(d.startsAt),
    endsAt: fromLocalInput(d.endsAt),
  };
}

function scheduleLabel(b: Banner, now: number) {
  if (!b.isActive) return { text: 'Выключен', tone: 'off' };
  if (b.startsAt && new Date(b.startsAt).getTime() > now)
    return { text: `С ${formatDateTime(b.startsAt)}`, tone: 'wait' };
  if (b.endsAt && new Date(b.endsAt).getTime() <= now) return { text: 'Завершён', tone: 'off' };
  return { text: 'Показывается', tone: 'on' };
}

function BannerPreview({
  draft,
  imageUrl,
}: {
  draft: Pick<Draft, 'title' | 'subtitle' | 'bgColor' | 'ctaText'>;
  imageUrl: string | null;
}) {
  return (
    <div
      className="banner-preview"
      style={{
        backgroundColor: draft.bgColor,
        backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
      }}
    >
      <div className={imageUrl ? 'banner-preview-body has-image' : 'banner-preview-body'}>
        <b>{draft.title || 'Заголовок баннера'}</b>
        {draft.subtitle ? <span>{draft.subtitle}</span> : null}
        {draft.ctaText ? <em>{draft.ctaText}</em> : null}
      </div>
    </div>
  );
}

export function BannersPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const editing = banners.find((b) => b.id === editingId) ?? null;

  const handleError = useCallback(
    (err: unknown) => {
      if (isAuthError(err)) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    },
    [logout, navigate],
  );

  const load = useCallback(() => {
    setLoading(true);
    bannersApi
      .list()
      .then((list) => {
        setBanners(list);
        setError('');
      })
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [handleError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function startEdit(b: Banner) {
    resetForm();
    setEditingId(b.id);
    setDraft(draftFrom(b));
    setNotice('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    if (!draft.title.trim()) {
      setError('Укажите заголовок');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = editingId
        ? await bannersApi.update(editingId, inputFrom(draft))
        : await bannersApi.create(inputFrom(draft));
      if (file) await bannersApi.uploadImage(saved.id, file);
      setNotice(editingId ? 'Баннер сохранён.' : 'Баннер создан — он уже виден в приложении.');
      resetForm();
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    if (!editingId) return;
    setBusy(true);
    try {
      await bannersApi.removeImage(editingId);
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(b: Banner) {
    setBusy(true);
    setError('');
    try {
      await bannersApi.update(b.id, { isActive: !b.isActive });
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Banner) {
    if (!window.confirm(`Удалить баннер «${b.title}»? Это нельзя отменить.`)) return;
    setBusy(true);
    setError('');
    try {
      await bannersApi.remove(b.id);
      if (editingId === b.id) resetForm();
      setNotice('Баннер удалён.');
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const previewImage = filePreview ?? mediaUrl(editing?.imageUrl);

  return (
    <div className="page">
      <div className="page-head">
        <h1>NBO-баннеры</h1>
        <p className="page-sub">
          Рекламные баннеры на главном экране мобильного приложения. Изменения видны сразу, без
          обновления приложения.
        </p>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? <OkNote>{notice}</OkNote> : null}

      <div className="panel banner-editor">
        <div className="banner-form">
          <h2 className="panel-title">{editing ? `Редактирование: ${editing.title}` : 'Новый баннер'}</h2>

          <label className="field">
            Заголовок *
            <input
              value={draft.title}
              maxLength={80}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Скидка 10% на цемент"
            />
          </label>
          <label className="field">
            Подзаголовок
            <input
              value={draft.subtitle}
              maxLength={160}
              onChange={(e) => set('subtitle', e.target.value)}
              placeholder="Только до конца месяца"
            />
          </label>

          <div className="form-grid">
            <label className="field">
              Текст кнопки
              <input
                value={draft.ctaText}
                maxLength={30}
                onChange={(e) => set('ctaText', e.target.value)}
                placeholder="Подробнее"
              />
            </label>
            <label className="field">
              Ссылка
              <input
                value={draft.ctaUrl}
                onChange={(e) => set('ctaUrl', e.target.value)}
                placeholder="https://… или /suppliers"
              />
            </label>
            <label className="field">
              Кому показывать
              <select
                value={draft.audience}
                onChange={(e) => set('audience', e.target.value as BannerAudience)}
              >
                {(Object.keys(BANNER_AUDIENCE_LABEL) as BannerAudience[]).map((a) => (
                  <option key={a} value={a}>
                    {BANNER_AUDIENCE_LABEL[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Города (через запятую, пусто — все)
              <input
                value={draft.cities}
                onChange={(e) => set('cities', e.target.value)}
                placeholder="Алматы, Астана"
              />
            </label>
            <label className="field">
              Показывать с
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </label>
            <label className="field">
              Показывать до
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </label>
            <label className="field">
              Порядок (меньше — раньше)
              <input
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(e) => set('sortOrder', e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
              <ImageUp size={16} className="ico" />
              {file ? file.name : 'Картинка (до 5 МБ)'}
            </button>
            {editing?.imageUrl && !file ? (
              <button type="button" className="ghost" disabled={busy} onClick={() => void removeImage()}>
                Убрать картинку
              </button>
            ) : null}
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
              />
              Включён
            </label>
          </div>

          <div className="form-row">
            <button type="button" disabled={busy} onClick={() => void save()}>
              {editing ? 'Сохранить' : 'Создать баннер'}
            </button>
            {editing ? (
              <button type="button" className="ghost" disabled={busy} onClick={resetForm}>
                Отмена
              </button>
            ) : null}
          </div>
        </div>

        <div className="banner-preview-col">
          <div className="muted">Так баннер выглядит в приложении</div>
          <BannerPreview draft={draft} imageUrl={previewImage} />
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Все баннеры</h2>
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : !banners.length ? (
          <p className="muted">Баннеров пока нет. Создайте первый выше.</p>
        ) : (
          <div className="banner-list">
            {banners.map((b) => {
              const state = scheduleLabel(b, now);
              return (
                <div key={b.id} className={`banner-row${editingId === b.id ? ' is-selected' : ''}`}>
                  <BannerPreview draft={draftFrom(b)} imageUrl={mediaUrl(b.imageUrl)} />
                  <div className="banner-row-meta">
                    <span className={`banner-state is-${state.tone}`}>{state.text}</span>
                    <span>
                      {BANNER_AUDIENCE_LABEL[b.audience]} ·{' '}
                      {b.cities.length ? b.cities.join(', ') : 'все города'} · порядок {b.sortOrder}
                    </span>
                    {b.endsAt ? <span className="muted">до {formatDateTime(b.endsAt)}</span> : null}
                    {b.ctaUrl ? <span className="muted mono-id">{b.ctaUrl}</span> : null}
                  </div>
                  <div className="banner-row-actions">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={b.isActive}
                        disabled={busy}
                        onChange={() => void toggle(b)}
                      />
                      Вкл
                    </label>
                    <button type="button" className="ghost" onClick={() => startEdit(b)}>
                      <Pencil size={15} className="ico" />
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={() => void remove(b)}
                      aria-label="Удалить"
                    >
                      <Trash2 size={15} className="ico" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
