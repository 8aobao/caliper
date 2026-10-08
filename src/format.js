// Turns a change into the text an agent reads. The server injects this file into the browser
// client too (for "Copy"), so keep it a single dependency-free function.
export function formatChange(c) {
  const el = c.element || {};
  const L = [];
  L.push(`## Caliper change ${c.id || '(not sent)'}${el.label ? ` — ${el.label}` : ''}`);
  L.push(`Page: ${c.url}${c.viewport ? `  (viewport ${c.viewport.w}×${c.viewport.h})` : ''}`);
  if (el.components && el.components.length) L.push(`React components (nearest first): ${el.components.join(' ‹ ')}`);
  if (el.sourceHint) L.push(`Source hint: ${el.sourceHint}`);
  L.push(`Element: ${el.openingTag || `<${el.tag}>`}`);
  if (el.text) L.push(`Text: "${el.text}"`);
  L.push(
    el.scope === 'all'
      ? `Scope: ALL ${el.matchCount} elements matching \`${el.classSelector}\` — change the shared component/style, not a single instance.`
      : `Scope: this one element (\`${el.selector}\`).`,
  );
  L.push('', 'Changes (computed value before → value the designer chose):');
  for (const ch of c.changes || []) {
    L.push(`- ${ch.property}: ${ch.from} → ${ch.to}${ch.hint ? `   [Tailwind: ${ch.hint}]` : ''}`);
  }
  if (c.tailwind) L.push('', `Suggested Tailwind (replace the matching classes): ${c.tailwind}`);
  if (c.note) L.push('', `Designer note: ${c.note}`);
  L.push('', 'CSS override currently producing the preview:', '```css', c.css || '', '```');
  return L.join('\n');
}

export const AGENT_GUIDE = `Apply each Caliper change in the source code so the page looks exactly like the designer's live preview.
- Find the element using the component names, classes and text. Edit the existing Tailwind classes / design tokens / CSS where the element is defined (don't add inline styles or !important).
- Tailwind hints are suggestions; prefer an existing token when the value matches one. For scope "ALL", change the shared component or class so every instance updates.
- The "from" values are computed styles (px). Respect responsive variants: only change the breakpoint that matches the given viewport unless the note says otherwise.
- When a change is done, resolve it (caliper_resolve with its id). The preview override then clears itself in the browser. If you can't or shouldn't apply it, dismiss it with a reason.`;
