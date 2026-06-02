import { previewTitle, firstUserText } from './title.js';

/**
 * Render a saved conversation as a self-contained Markdown document — a portable
 * artifact of a research session. Pure (no clock/fs): the caller passes
 * `exportedAt` so output is deterministic and testable.
 */
export function conversationToMarkdown(turns = [], { sessionId, exportedAt } = {}) {
  const title = previewTitle(firstUserText(turns), 80);
  const lines = [`# ${title}`, ''];
  lines.push(`- **Session:** \`${sessionId || 'unknown'}\``);
  if (exportedAt) lines.push(`- **Exported:** ${exportedAt}`);
  lines.push(`- **Turns:** ${turns.length}`, '', '---', '');

  for (const t of turns) {
    lines.push(`## ${t.role === 'user' ? 'You' : 'Aurora'}`, '');
    lines.push(t.text ?? '', '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
