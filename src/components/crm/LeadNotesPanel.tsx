import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { LeadNote } from '../../types';

type Props = {
  notes: LeadNote[];
  busy?: boolean;
  onAdd: (body: string) => Promise<void>;
};

export function LeadNotesPanel({ notes, busy, onAdd }: Props) {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const [text, setText] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    await onAdd(body);
    setText('');
  }

  return (
    <div className="lead-notes-panel">
      <h4>{t('supplier.notesTitle')}</h4>
      {notes.length === 0 ? (
        <p className="meta">{t('supplier.notesEmpty')}</p>
      ) : (
        <ul className="lead-notes-list">
          {notes.map((note) => (
            <li key={note.id}>
              <div className="lead-note-top">
                <b>{note.user.fullName}</b>
                <small>{formatDateTime(note.createdAt)}</small>
              </div>
              <p>{note.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="lead-note-form" onSubmit={(e) => void submit(e)}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('supplier.notesPlaceholder')}
          rows={2}
        />
        <button type="submit" className="ghost" disabled={busy || !text.trim()}>
          {t('supplier.notesAdd')}
        </button>
      </form>
    </div>
  );
}
