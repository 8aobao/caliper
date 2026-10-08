# Caliper

Click any element on your dev site, see the parameters that make it, tune them live, then **save the preview** or **send it to the agent** to make it real in code.

- **Inspect** (`⌥C`) — hover shows the box model (margin / padding / content) plus type at a glance; click selects.
- **Panel** — Typography (font, size, weight, leading, tracking, color, align, case), Layout (flex/grid direction, align, justify, gap), Spacing (padding / margin, X/Y or per side), Size, Shape (radius, border), Fill (background, opacity, shadow). Token names from your CSS variables (Tailwind v4 `@theme`) show next to values, and the color picker offers your palette.
- **Tune** — drag any value to scrub (⇧ ×10, ⌥ ×0.1), click it to type (any CSS: `1.5rem`, `auto`, `var(--x)`), arrow keys nudge. Orange dot = changed; click it to reset.
- **Scope** — *This element* or *All matching* (same tag + classes, i.e. every instance of that component). Matches get dashed outlines.
- **Save** — the preview survives reloads (localStorage). Unsaved drafts last for the tab session.
- **Send to agent** (`⌘↵` in the note) — queues the change with selector, classes, text, React component names, before→after values, Tailwind suggestions and your note. When the agent resolves it, the override clears itself (the code now carries it).
- **Toolbar** — drag it anywhere (from any part of it; double-click the grip to reset), collapse it to a small chip with `‹`; both are remembered. change list (toggle each preview, jump to it, remove), 👁 original vs. edited, *Send N* for everything unsent, connection dot.
- **Copy** — the same agent prompt to the clipboard, for any agent, no server needed.

## Setup

Caliper is one script tag served by a tiny local server (no dependencies).

The MCP server also hosts the HTTP server, so once registered, it runs whenever a Claude Code session is open:

```sh
claude mcp add -s user caliper -- node ~/caliper/bin/caliper.js mcp
```

Or run the HTTP server alone: `node ~/caliper/bin/caliper.js server` (port 4848, `CALIPER_PORT` to change).

Add the script to the project in dev only. Next.js (App Router) root layout:

```tsx
import Script from "next/script";
// …inside <body>:
{process.env.NODE_ENV === "development" && (
  <Script src="http://localhost:4848/caliper.js" strategy="afterInteractive" />
)}
```

Anything else: `<script src="http://localhost:4848/caliper.js" defer></script>`. Demo: http://localhost:4848/demo.

## Agent side

MCP tools: `caliper_pending` (list + mark acknowledged), `caliper_watch` (block until new changes — watch mode), `caliper_resolve {id, summary}`, `caliper_dismiss {id, reason}`. The designer sees each status live in the panel.

Without MCP, the HTTP API (Agentation-style): `GET /pending`, `GET /changes/:id`, `PATCH /changes/:id {"status":"resolved","reply":"…"}`. CLI: `caliper pending`, `caliper resolve <id> [summary]`.

Changes are stored in `~/.caliper/store.json` (finished ones are pruned after a week).

## Notes

- Overrides are `!important` rules in one `<style id="caliper-overrides">`, keyed by a structural selector (this element) or class selector (all matching). They survive React re-renders and HMR, but a structural selector can drift if the DOM above it changes.
- The "from" values are computed styles at the current viewport. On responsive sites, say in the note if a change is meant for one breakpoint only.
- Hover/focus states aren't editable yet.
