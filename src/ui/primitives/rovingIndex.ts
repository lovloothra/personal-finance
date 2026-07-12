/**
 * Pure roving-tabindex arrow-key logic shared by Tabs and SegmentedControl.
 * Given the currently-focused index, the key that was pressed, and the
 * number of items, returns the index that should receive focus (and, in
 * both consumers, selection — "selection follows focus"), or `null` if the
 * key isn't one this widget handles.
 */
export function rovingIndex(current: number, key: string, length: number): number | null {
  if (length <= 0) return null;
  switch (key) {
    case 'ArrowLeft':
      return (current - 1 + length) % length;
    case 'ArrowRight':
      return (current + 1) % length;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}
