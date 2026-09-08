import { useEffect, useState } from 'react';
import { productsApi } from '../api';

export type DirectoryMeta = {
  cities: string[];
  categories: string[];
  units: string[];
};

const empty: DirectoryMeta = { cities: [], categories: [], units: [] };

export function useDirectoryMeta() {
  const [meta, setMeta] = useState<DirectoryMeta>(empty);

  useEffect(() => {
    void productsApi
      .directoryMeta()
      .then(setMeta)
      .catch(() => setMeta(empty));
  }, []);

  return meta;
}
