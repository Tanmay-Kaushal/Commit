import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-[var(--paper)] text-[var(--ink)] border-2 border-[var(--ink)] rounded-2xl shadow-[4px_4px_0_var(--ink)]',
        className
      )}
      {...props}
    />
  );
}
