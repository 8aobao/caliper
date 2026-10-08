# Caliper

[![npm version](https://img.shields.io/npm/v/caliper-dev)](https://www.npmjs.com/package/caliper-dev)

**Caliper** is a live style inspector for your dev site. Click any element, see the parameters that make it (type, spacing, size, radius, border, fill, with your design tokens), tune them live, then save the preview or send it to your coding agent to make it real in code.

## Install

```bash
npm install caliper-dev -D
```

## Usage

```tsx
import { Caliper } from 'caliper-dev';

function App() {
  return (
    <>
      <YourApp />
      {process.env.NODE_ENV === 'development' && <Caliper />}
    </>
  );
}
```

In a Next.js App Router project, render it in the root layout. It's a client component already.

The toolbar appears as a small circle at the bottom of the page. Click it or press `⌥C` to start, then click any element.

Not using React? `mount()` does the same from plain JS: `import { mount } from 'caliper-dev'; const unmount = mount();`. Or use the script tag that `caliper-mcp` serves: `<script src="http://localhost:4848/caliper.js" defer></script>`.

## Connect to your agent

`<Caliper />` works locally: inspect, tune, save previews, and **Copy** a ready-made prompt for any agent. To **Send** changes straight to your agent, run the Caliper server and point the toolbar at it:

```tsx
<Caliper endpoint="http://localhost:4848" />
```

```bash
npx caliper-mcp init     # connects Claude Code and shows the snippet above
npx caliper-mcp doctor   # checks the setup
```

Your agent runs `npx -y caliper-mcp server`, which serves the toolbar's endpoint and exposes MCP tools (`caliper_pending`, `caliper_watch`, `caliper_resolve`, `caliper_dismiss`). When the agent resolves a change, its preview override clears itself, because the code now carries it. To confirm the whole loop: send a change, ask your agent to "check Caliper", and make sure it reads back your change and page.

## Features

- **Inspect.** Hover shows the box model (margin, padding, content) and type at a glance; click selects.
- **The element's own parameters only.** Typography appears on elements that own their text; Layout on flex/grid containers; Spacing, Size, Shape (radius, border, border opacity) and Fill everywhere they apply.
- **Design tokens.** Values that match your CSS variables (Tailwind v4 `@theme`) show their token; color picks write `var(--token)`; agent hints come as Tailwind classes (`px-6 bg-pink border-ink/60`).
- **Tune like DialKit.** Drag to scrub (⇧ ×10, ⌥ ×0.1), click to type any CSS, arrows nudge, Tab walks the values. Colors: the page's palette, plus an HSL picker.
- **This element or all matching.** Change one instance or every element with the same classes.
- **Notes.** Ask for anything the panel doesn't cover ("add a soft shadow"); a note alone is a valid change.
- **Save previews.** They persist across reloads until sent or removed; the eye toggles original vs. edited.

## Shortcuts

| Key | |
|---|---|
| `⌥C` | Open / close Caliper |
| `Esc` | Close the topmost thing (dropdown, list, selection, then Caliper) |
| `⌥↑` / `⌥↓` | Select parent / first child |
| `Tab` / `⇧Tab` | Next / previous value |
| `⌘↵` (in the note) | Send |

## License

[PolyForm Shield 1.0.0](./LICENSE). Free to use, modify and share, except to build a product that competes with Caliper.
