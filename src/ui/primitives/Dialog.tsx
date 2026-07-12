'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface DialogProps {
  open?: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  width?: number;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Exposes the animated close (matches the existing drawers' slide-out
// timing) to elements nested inside `children` — e.g. a drawer-x button or
// a Cancel button — without widening `children` into a render-prop.
const DialogCloseCtx = createContext<() => void>(() => {});

/** Read the animated close handler from inside a Dialog's children (e.g. a
 * drawer-x or Cancel button). No-op outside a Dialog. */
export function useDialogClose(): () => void {
  return useContext(DialogCloseCtx);
}

/**
 * Accessible right-drawer/modal. Reuses the existing `.scrim`/`.drawer`
 * slide-in CSS (workbench.css) — this component owns the enter/exit timing
 * and a11y wiring that ProvenanceDrawer/ProfileEditDrawer used to each
 * hand-roll (Escape, focus trap, focus restore, scroll lock).
 */
export function Dialog({ open = true, onClose, label, children, width }: DialogProps) {
  const [show, setShow] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Exit transition, then tell the parent to actually unmount us — mirrors
  // the 220ms slide-out both original drawers used.
  const close = useCallback(() => {
    setShow(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  // Enter transition + remember what had focus so it can be restored later.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => setShow(true), 10);
    return () => clearTimeout(t);
  }, [open]);

  // Escape-to-close + Tab focus trap — a single document listener while open.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = drawerRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  // Move focus into the drawer on open; restore it to whatever had focus
  // before the drawer opened once this effect tears down.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const root = drawerRef.current;
      const target = root?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? root;
      target?.focus();
    }, 20);
    return () => {
      clearTimeout(t);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Content scroll lock. `.app` is already `overflow: hidden` (see
  // workbench.css), so the page itself never scrolls — `.content` is the
  // real scroller; fall back to <body> if it isn't found.
  useEffect(() => {
    if (!open) return;
    const scroller = document.querySelector<HTMLElement>('.content') ?? document.body;
    const prevOverflow = scroller.style.overflow;
    scroller.style.overflow = 'hidden';
    return () => {
      scroller.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <DialogCloseCtx.Provider value={close}>
      <div className={`scrim ${show ? 'show' : ''}`} onClick={close} />
      <aside
        ref={drawerRef}
        className={`drawer ${show ? 'show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={width ? { width } : undefined}
      >
        {children}
      </aside>
    </DialogCloseCtx.Provider>
  );
}
