'use client';
import Link from 'next/link';
import type { AriaAttributes, MouseEventHandler, ReactNode } from 'react';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends AriaAttributes {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** lucide-react icon name, rendered via the shared Icon primitive. */
  icon?: string;
  /** When set, renders a Next.js `<Link>` styled identically to the button
   * variants. Ignored (falls back to `<button>`) when `disabled` is set —
   * a disabled link has no real semantics, so it renders as a button. */
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  title?: string;
  /** Only meaningful when rendered as a `<button>`. */
  type?: 'button' | 'submit' | 'reset';
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost',
  // .link is only styled when nested under .card-head (see workbench.css) —
  // matches every existing `className="link"` call site in the app today.
  link: 'link',
};

/** Thin wrapper over the existing `.btn`/`.link` CSS. Renders a `<Link>`
 * when `href` is given (unless `disabled`), otherwise a `<button type="button">`. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  href,
  onClick,
  disabled = false,
  children,
  className = '',
  title,
  type = 'button',
  ...aria
}: ButtonProps) {
  const cls = [
    VARIANT_CLASS[variant],
    variant !== 'link' && size !== 'md' ? `btn-${size}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const iconEl = icon ? <Icon name={icon} size={size === 'lg' ? 17 : 15} /> : null;

  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={cls}
        title={title}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
        {...aria}
      >
        {iconEl}
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={cls}
      title={title}
      disabled={disabled}
      onClick={onClick as MouseEventHandler<HTMLButtonElement> | undefined}
      {...aria}
    >
      {iconEl}
      {children}
    </button>
  );
}
