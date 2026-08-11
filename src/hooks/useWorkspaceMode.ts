import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const WORKSPACE_KEY = 'huphup_workspace';

export type WorkspaceMode = 'buyer' | 'supplier';

function readStored(): WorkspaceMode {
  if (typeof window === 'undefined') return 'buyer';
  const v = localStorage.getItem(WORKSPACE_KEY);
  return v === 'supplier' ? 'supplier' : 'buyer';
}

export function useWorkspaceMode() {
  const location = useLocation();
  const [mode, setMode] = useState<WorkspaceMode>(readStored);

  useEffect(() => {
    const path = location.pathname;
    const ws = new URLSearchParams(location.search).get('workspace');
    if (ws === 'supplier' || ws === 'buyer') {
      localStorage.setItem(WORKSPACE_KEY, ws);
      setMode(ws);
      return;
    }
    if (path.startsWith('/supplier')) {
      localStorage.setItem(WORKSPACE_KEY, 'supplier');
      setMode('supplier');
    } else if (
      path.startsWith('/app') ||
      path.startsWith('/requests') ||
      path.startsWith('/offers') ||
      path.startsWith('/suppliers') ||
      path.startsWith('/profile')
    ) {
      localStorage.setItem(WORKSPACE_KEY, 'buyer');
      setMode('buyer');
    }
  }, [location.pathname, location.search]);

  return { isSupplier: mode === 'supplier', mode };
}
