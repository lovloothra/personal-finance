/**
 * One canonical precedence for a fetched view's render state:
 * loading → error → empty → ready. Every dashboard page maps its hook
 * output through this so failure can never masquerade as "no data yet"
 * (and vice versa).
 */
export type ViewState = 'loading' | 'error' | 'empty' | 'ready';

export function viewState(loading: boolean, error: string | null, hasData: boolean | undefined): ViewState {
  if (loading) return 'loading';
  if (error) return 'error';
  if (!hasData) return 'empty';
  return 'ready';
}
