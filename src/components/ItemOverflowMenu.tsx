import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { AppIcon } from './AppIcon';

function eventElement(e: Event): Element | null {
  const node = e.target;
  if (node instanceof Element) return node;
  if (node instanceof Node) return node.parentElement;
  return null;
}

export function ItemOverflowMenu({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function onDocDown(e: Event) {
      const el = eventElement(e);
      if (!el) return;
      if (rootRef.current?.contains(el)) return;
      if (menuRef.current?.contains(el) || el.closest('.recent-menu')) return;
      setOpen(false);
    }
    if (open) document.addEventListener('pointerdown', onDocDown);
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

  return (
    <div className="item-overflow" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className="recent-row-more"
        aria-label={ariaLabel}
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
              onClick={() => setOpen(false)}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
