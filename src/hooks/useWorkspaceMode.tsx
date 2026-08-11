import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

const WORKSPACE_KEY = 'huphup_workspace';

export type WorkspaceMode = 'buyer' | 'supplier';

function readStored(): WorkspaceMode {
  if (typeof window === 'undefined') return 'buyer';
  const v = localStorage.getItem(WORKSPACE_KEY);
  return v === 'supplier' ? 'supplier' : 'buyer';
}

function persist(mode: WorkspaceMode) {
  localStorage.setItem(WORKSPACE_KEY, mode);
}

type WorkspaceModeContextValue = {
  isSupplier: boolean;
  mode: WorkspaceMode;
};

const WorkspaceModeContext = createContext<WorkspaceModeContextValue>({
  isSupplier: false,
  mode: 'buyer',
});

function syncModeFromPath(pathname: string, search: string): WorkspaceMode | null {
  const ws = new URLSearchParams(search).get('workspace');
  if (ws === 'supplier' || ws === 'buyer') {
    return ws;
  }
  if (pathname.startsWith('/supplier')) {
    return 'supplier';
  }
  if (
    pathname.startsWith('/app') ||
    pathname.startsWith('/requests') ||
    pathname.startsWith('/offers') ||
    pathname.startsWith('/suppliers') ||
    pathname.startsWith('/profile')
  ) {
    return 'buyer';
  }
  // Shared routes (e.g. /conversations) keep the last chosen workspace.
  return null;
}

export function WorkspaceModeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [mode, setMode] = useState<WorkspaceMode>(() => {
    const fromPath = syncModeFromPath(location.pathname, location.search);
    const initial = fromPath ?? readStored();
    if (fromPath) persist(fromPath);
    return initial;
  });

  useEffect(() => {
    const next = syncModeFromPath(location.pathname, location.search);
    if (next) {
      persist(next);
      setMode(next);
    }
  }, [location.pathname, location.search]);

  return (
    <WorkspaceModeContext.Provider
      value={{ isSupplier: mode === 'supplier', mode }}
    >
      {children}
    </WorkspaceModeContext.Provider>
  );
}

export function useWorkspaceMode() {
  return useContext(WorkspaceModeContext);
}
