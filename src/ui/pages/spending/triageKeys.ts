/**
 * Pure keyboard-to-action reducer for the triage list. TriageView owns the
 * DOM listener and dispatch; this function only decides which action (if
 * any) a keypress maps to, given the current context.
 */
export interface TriageKeyCtx {
  groupCount: number;
  focusIndex: number;
  inInput: boolean;
}

export type TriageKeyAction =
  | { type: 'focusNext' }
  | { type: 'focusPrev' }
  | { type: 'focusSearch' }
  | { type: 'pick'; n: number }
  | { type: 'assign' }
  | { type: 'transfer' }
  | null;

export function triageKeyAction(key: string, ctx: TriageKeyCtx): TriageKeyAction {
  // While focus is inside an input/textarea/select/contenteditable, every
  // key is left alone — including Escape, whose "blur back to the list"
  // behavior stays in the DOM layer (TriageView), not this pure reducer.
  if (ctx.inInput) return null;

  switch (key) {
    case 'j':
      return { type: 'focusNext' };
    case 'k':
      return { type: 'focusPrev' };
    case '/':
      return { type: 'focusSearch' };
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
      return ctx.groupCount > 0 ? { type: 'pick', n: Number(key) } : null;
    case 'Enter':
      return { type: 'assign' };
    case 'x':
      return { type: 'transfer' };
    default:
      return null;
  }
}
