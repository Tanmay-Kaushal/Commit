import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

// The compact in-page ☰ used in page headers (Dashboard, Pact page, ...) —
// opens a small dropdown instead of the full-height global Sheet.
export default function SectionMenu({
  label = 'Menu',
  align = 'right',
  children,
}: {
  label?: string;
  align?: 'left' | 'right';
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="w-9 h-9 inline-flex flex-col items-center justify-center gap-[3px] rounded-full border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] shadow-[2px_2px_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-transform"
      >
        <span className="block w-4 h-0.5 bg-[var(--ink)]" />
        <span className="block w-4 h-0.5 bg-[var(--ink)]" />
        <span className="block w-4 h-0.5 bg-[var(--ink)]" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-2 min-w-48 rounded-2xl border-2 border-[var(--ink)] bg-[var(--paper)]',
            'shadow-[4px_4px_0_var(--ink)] py-1.5 overflow-hidden motion-safe:animate-[sheet-in_120ms_ease-out]',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
