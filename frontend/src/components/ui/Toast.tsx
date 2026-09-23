import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type ToastTone = 'default' | 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };
type ToastContextType = { show: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none px-4 w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-full border-2 bg-[var(--paper)] px-4 py-2 text-sm font-semibold',
              'shadow-[3px_3px_0_var(--ink)] motion-safe:animate-[toast-in_150ms_ease-out] max-w-[90vw]',
              t.tone === 'success' && 'border-emerald-600 text-emerald-700 dark:text-emerald-400',
              t.tone === 'error' && 'border-red-600 text-red-700 dark:text-red-400',
              t.tone === 'default' && 'border-[var(--ink)] text-[var(--ink)]'
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
