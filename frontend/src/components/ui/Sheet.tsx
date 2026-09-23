import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-[var(--paper)] border-l-2 border-[var(--ink)] shadow-[-4px_0_0_var(--ink)] outline-none flex flex-col motion-safe:animate-[sheet-in_180ms_ease-out]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[var(--line)]">
          <span className="font-display text-lg text-[var(--ink)]">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full border-2 border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--line)] transition-colors"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">{children}</div>
      </div>
    </div>,
    document.body
  );
}
