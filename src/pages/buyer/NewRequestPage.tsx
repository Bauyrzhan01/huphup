import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestsApi } from '../../api';
import { BuyerLayout } from '../../layouts/AppLayouts';
import type { AnalyzeResult } from '../../types';

export function NewRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setText] = useState(
    () => sessionStorage.getItem('huphupDraft') ?? '',
  );
  const [analyzed, setAnalyzed] = useState<AnalyzeResult | null>(null);
  const [city, setCity] = useState('Алматы');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!text.trim()) return;
    void requestsApi.analyze(text).then((res) => {
      setAnalyzed(res);
      setTitle(res.title);
      setCity(res.city || 'Алматы');
    });
  }, [text]);

  async function onPublish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await requestsApi.create({
        title: title || analyzed?.title || text.slice(0, 80),
        description: text,
        category: analyzed?.category,
        city,
        quantity: analyzed?.quantity,
        deadline: analyzed?.deadline,
        rawText: text,
      });
      await requestsApi.publish(created.id);
      sessionStorage.removeItem('huphupDraft');
      navigate(`/requests/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.publishError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BuyerLayout
      crumb={t('requests.newRequest')}
      actions={
        <Link className="ghost" to="/app">
          {t('common.cancel')}
        </Link>
      }
    >
      <div className="page narrow">
        <div className="steps">
          <div className="step done">
            <span className="step-num">✓</span>
            {t('requests.stepRequest')}
          </div>
          <span className="step-line" />
          <div className="step active">
            <span className="step-num">2</span>
            {t('requests.stepReview')}
          </div>
          <span className="step-line" />
          <div className="step">
            <span className="step-num">3</span>
            {t('requests.stepPublish')}
          </div>
        </div>
        <div className="page-head">
          <div>
            <h1>{t('requests.reviewTitle')}</h1>
            <p>{t('requests.reviewSubtitle')}</p>
          </div>
        </div>
        <div className="ai-box">
          <div className="ai-title">{t('requests.aiTitle')}</div>
          <div className="ai-grid">
            <div className="ai-cell">
              <small>{t('requests.category')}</small>
              <b>{analyzed?.category ?? t('common.empty')}</b>
            </div>
            <div className="ai-cell">
              <small>{t('requests.city')}</small>
              <b>{analyzed?.city ?? city}</b>
            </div>
            <div className="ai-cell">
              <small>{t('requests.quantity')}</small>
              <b>{analyzed?.quantity ?? t('common.empty')}</b>
            </div>
            <div className="ai-cell">
              <small>{t('requests.deadline')}</small>
              <b>{analyzed?.deadline ?? t('requests.clarify')}</b>
            </div>
          </div>
        </div>
        <form className="panel" onSubmit={onPublish}>
          <div className="form-grid">
            <div className="field full">
              <label>{t('requests.fieldTitle')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field full">
              <label>{t('requests.fieldNeed')}</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t('requests.city')}</label>
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                <option>Алматы</option>
                <option>Астана</option>
                <option>Шымкент</option>
              </select>
            </div>
          </div>
          {error ? (
            <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
              {error}
            </p>
          ) : null}
          <div className="actions">
        <Link className="ghost" to="/app">
          {t('common.back')}
        </Link>
            <button className="primary" disabled={busy || !text.trim()}>
              {busy ? t('requests.publishing') : t('requests.publish')}
            </button>
          </div>
        </form>
      </div>
    </BuyerLayout>
  );
}
