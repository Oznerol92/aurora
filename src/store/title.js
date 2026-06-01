/**
 * Derive a short, single-line title/preview for a conversation from a piece of
 * text (normally its first user message). Whitespace is collapsed and the
 * result is clipped with an ellipsis. Empty input yields a stable placeholder so
 * callers don't have to special-case it.
 */
export function previewTitle(text, max = 56) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '(untitled)';
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** The first user turn's text in a conversation, or '' if there isn't one. */
export function firstUserText(turns = []) {
  return turns.find((t) => t.role === 'user')?.text || '';
}
