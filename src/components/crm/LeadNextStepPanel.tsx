import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lead } from '../../types';

type Props = {
  lead: Lead;
  busy?: boolean;
  onSave: (text: string, at: string) => Promise<void>;
};

export function LeadNextStepPanel({ lead, busy, onSave }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(lead.nextStepText ?? '');
  const [at, setAt] = useState(
    lead.nextStepAt ? lead.nextStepAt.slice(0, 16) : '',
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    await onSave(text.trim(), at ? new Date(at).toISOString() : '');
  }

  return (
    <form className="lead-next-step-panel" onSubmit={(e) => void submit(e)}>
      <h4>{t('supplier.nextStepTitle')}</h4>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('supplier.nextStepPlaceholder')}
      />
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
      />
      <button type="submit" className="ghost" disabled={busy}>
        {t('common.save')}
      </button>
    </form>
  );
}
