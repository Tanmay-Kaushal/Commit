import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';

export default function MenuItem({
  children,
  onClick,
  to,
  danger,
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  const classes = cn(
    'flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm font-semibold',
    'hover:bg-[var(--line)] transition-colors',
    danger ? 'text-red-600 dark:text-red-400' : 'text-[var(--ink)]'
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes} role="menuitem">
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} role="menuitem">
      {icon}
      {children}
    </button>
  );
}
