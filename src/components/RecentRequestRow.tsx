import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Star } from 'lucide-react';
import { requestsApi } from '../api';
import type { RequestItem } from '../types';
import { AppIcon } from './AppIcon';

export function RecentRequestRow({
  request,
  onCloseNav,
  onChanged,
}: {
  request: RequestItem;
  onCloseNav?: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onDocClick(e: Event) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('.recent-menu')) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggleMenu(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 188;
      setPos({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      });
    }
    setOpen((v) => !v);
  }

  async function toggleFavorite() {
    setBusy(true);
    try {
      await requestsApi.favorite(request.id, !request.isFavorite);
      setOpen(false);
      onChanged();
    } catch {
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function hideChat() {
    if (!window.confirm(t('nav.deleteChatConfirm'))) return;
    setBusy(true);
    try {
      await requestsApi.hide(request.id);
      setOpen(false);
      onChanged();
      onCloseNav?.();
      if (location.pathname.includes(request.id)) {
        navigate('/app', { replace: true });
      }
    } catch {
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`recent-row${request.isFavorite ? ' is-fav' : ''}`} ref={rootRef}>
      <Link className="recent-row-link" to={`/requests/${request.id}`} onClick={onCloseNav}>
        {request.isFavorite ? (
          <AppIcon icon={Star} size={12} className="recent-star" fill="currentColor" />
        ) : null}
        <span>{request.title}</span>
      </Link>
      <button
        ref={btnRef}
        type="button"
        className="recent-row-more"
        aria-label={t('nav.chatActions')}
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <AppIcon icon={MoreHorizontal} size={16} />
      </button>
      {open
        ? createPortal(
            <div className="recent-menu" style={{ top: pos.top, left: pos.left }} role="menu">
              <button type="button" role="menuitem" disabled={busy} onClick={() => void toggleFavorite()}>
                {request.isFavorite ? t('nav.unfavorite') : t('nav.favorite')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                disabled={busy}
                onClick={() => void hideChat()}
              >
                {t('nav.deleteChat')}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
