import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { attachmentsApi } from '../api';
import { resolvePrivateMediaUrl } from '../api/client';
import type { Attachment } from '../types';

type Props = {
  requestId: string;
  editable?: boolean;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RequestAttachments({ requestId, editable = false }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void attachmentsApi
      .list(requestId)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, t]);

  async function onPickFile(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    try {
      const created = await attachmentsApi.upload(requestId, file);
      setItems((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRemove(id: string) {
    setError('');
    try {
      await attachmentsApi.remove(requestId, id);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="section-title">{t('attachments.title')}</div>
      <p className="meta" style={{ margin: '0 0 12px' }}>
        {t('attachments.hint')}
      </p>
      {error ? (
        <p className="notice" style={{ color: '#b45309', marginBottom: 12 }}>
          {error}
        </p>
      ) : null}
      {editable ? (
        <div className="actions" style={{ marginBottom: 12 }}>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="ghost"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? t('attachments.uploading') : t('attachments.upload')}
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="assist-note">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="assist-note">{t('attachments.empty')}</p>
      ) : (
        <ul className="attachment-list">
          {items.map((a) => (
            <li key={a.id} className="attachment-item">
              <a
                href={resolvePrivateMediaUrl(a.fileUrl)}
                target="_blank"
                rel="noreferrer"
              >
                {a.fileName}
              </a>
              <span className="meta">
                {formatSize(a.sizeBytes)}
                {editable ? (
                  <button
                    type="button"
                    className="ghost"
                    style={{ marginLeft: 8, padding: '2px 8px' }}
                    onClick={() => void onRemove(a.id)}
                  >
                    {t('attachments.remove')}
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
