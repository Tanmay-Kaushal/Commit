import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full border-2 font-semibold whitespace-nowrap ' +
  'transition-transform duration-100 ease-out select-none ' +
  'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ' +
  'disabled:opacity-40 disabled:pointer-events-none disabled:active:translate-x-0 disabled:active:translate-y-0';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] shadow-[3px_3px_0_var(--ink)] hover:brightness-110',
  secondary:
    'bg-[var(--paper)] text-[var(--ink)] border-[var(--ink)] shadow-[3px_3px_0_var(--ink)] hover:bg-[var(--line)]',
  danger:
    'bg-[var(--paper)] text-red-600 dark:text-red-400 border-red-600 dark:border-red-400 shadow-[3px_3px_0_var(--ink)] hover:bg-red-50 dark:hover:bg-red-950',
  ghost: 'bg-transparent text-[var(--ink)] border-transparent shadow-none hover:bg-[var(--line)] active:translate-x-0 active:translate-y-0',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-6 py-3',
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & { to?: undefined };

type ButtonAsLink = CommonProps & Omit<LinkProps, 'className'> & { to: LinkProps['to'] };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export default function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], className);

  if ('to' in props && props.to !== undefined) {
    const { to, ...rest } = props as ButtonAsLink;
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  const rest = props as ButtonAsButton;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
