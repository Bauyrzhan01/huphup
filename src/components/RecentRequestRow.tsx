import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Star } from 'lucide-react';
import { requestsApi } from '../api';
import type { RequestItem } from '../types';
import { AppIcon } from './AppIcon';

function eventElement(e: Event): Element | null {
  const node = e.target;
  if (node instanceof Element) return node;
  if (node instanceof Node) return node.parentElement;
  return null;
}

export function RecentRequestRow({
  request,
  onCloseNav,
  onChanged,
  onHidden,
}: {
  request: RequestItem;
  onCloseNav?: () => void;
  onChanged: () => void;
  onHidden?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onDocDown(e: Event) {
      const el = eventElement(e);
      if (!el) return;
      if (rootRef.current?.contains(el)) return;
      if (menuRef.current?.contains(el) || el.closest('.recent-menu')) return;
      setOpen(false);
    }
    if (open) {
      document.addEventListener('pointerdown', onDocDown);
    }
    return () => document.removeEventListener('pointerdown', onDocDown);
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

  async function toggleFavorite(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
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

  async function hideChat(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setOpen(false);
    if (!window.confirm(t('nav.deleteChatConfirm'))) return;
    setBusy(true);
    try {
      await requestsApi.hide(request.id);
      onHidden?.(request.id);
      onChanged();
      onCloseNav?.();
      if (location.pathname.includes(request.id)) {
        navigate('/app', { replace: true });
      }
    } catch {
      window.alert(t('common.error'));
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
            <div
              ref={menuRef}
              className="recent-menu"
              style={{ top: pos.top, left: pos.left }}
              role="menu"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button type="button" role="menuitem" disabled={busy} onClick={(e) => void toggleFavorite(e)}>
                {request.isFavorite ? t('nav.unfavorite') : t('nav.favorite')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                disabled={busy}
                onClick={(e) => void hideChat(e)}
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
