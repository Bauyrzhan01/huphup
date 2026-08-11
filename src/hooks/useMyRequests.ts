import { useCallback, useEffect, useState } from 'react';
import { requestsApi } from '../api';
import type { RequestItem } from '../types';

export function useMyRequests() {
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
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload };
}
