import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestsApi } from '../../api';
import { RequestAttachments } from '../../components/RequestAttachments';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useDirectoryMeta } from '../../hooks/useDirectoryMeta';
import type { RequestItem } from '../../types';

export function EditRequestPage() {
  const { t } = useTranslation();
  const { cities, categories } = useDirectoryMeta();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<RequestItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void requestsApi
      .get(id)
      .then((req) => {
        if (req.status !== 'DRAFT' && req.status !== 'CANCELLED') {
          throw new Error(t('requests.editNotAllowed'));
        }
        setRequest(req);
        setTitle(req.title);
        setDescription(req.description);
        setCity(req.city ?? '');
        setCategory(req.category ?? '');
        setQuantity(req.quantity ?? '');
        setDeadline(req.deadline ?? '');
        setBudgetMin(req.budgetMin != null ? String(req.budgetMin) : '');
        setBudgetMax(req.budgetMax != null ? String(req.budgetMax) : '');
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('common.error')),
      );
  }, [id, t]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await requestsApi.update(id, {
        title,
        description,
        city: city || undefined,
        category: category || undefined,
        quantity: quantity || undefined,
        deadline: deadline || undefined,
        budgetMin: budgetMin ? Number(budgetMin) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
      });
      navigate(`/requests/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BuyerLayout crumb={t('requests.editCrumb')}>
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('requests.editTitle')}</h1>
            <p>{request?.code ?? t('common.loading')}</p>
          </div>
          {request ? (
            <Link className="ghost" to={`/requests/${request.id}`}>
              {t('common.cancel')}
            </Link>
          ) : null}
        </div>
        {error ? (
          <p className="notice" style={{ color: '#b45309' }}>
            {error}
          </p>
        ) : null}
        {request ? (
          <form className="panel" onSubmit={onSave}>
            <div className="form-grid">
              <div className="field full">
                <label>{t('requests.fieldTitle')}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="field full">
                <label>{t('requests.fieldNeed')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>{t('requests.city')}</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  list="request-cities"
                />
                <datalist id="request-cities">
                  {cities.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>{t('requests.category')}</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list="request-categories"
                />
                <datalist id="request-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>{t('requests.quantity')}</label>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('requests.deadline')}</label>
                <input value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('requests.budgetMin')}</label>
                <input
                  type="number"
                  min={0}
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                />
              </div>
              <div className="field">
                <label>{t('requests.budgetMax')}</label>
                <input
                  type="number"
                  min={0}
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                />
              </div>
            </div>
            <div className="actions">
              <Link className="ghost" to={`/requests/${id}`}>
                {t('common.back')}
              </Link>
              <button className="primary" disabled={busy}>
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        ) : !error ? (
          <p className="assist-note">{t('common.loading')}</p>
        ) : null}
        {request ? (
          <RequestAttachments requestId={request.id} editable />
        ) : null}
      </div>
    </BuyerLayout>
  );
}
