import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requestsApi } from '../api';
import { mapApiError } from '../utils/apiErrors';
import type { RequestItem } from '../types';

export function useMyRequests() {
  const { t } = useTranslation();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await requestsApi.list();
      setItems(list);
    } catch (err) {
      setItems([]);
      setError(mapApiError(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload };
}
