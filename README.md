# Caliper

Click any element on your dev site, see the parameters that make it, tune them live, then **save the preview** or **send it to your coding agent** to make it real in code.

| Package | |
|---|---|
| [`caliper-dev`](packages/caliper-dev) | The toolbar: a React component (`<Caliper />`), `mount()` for anything else |
| [`caliper-mcp`](packages/caliper-mcp) | The server + MCP tools that carry changes to your agent |

```bash
npm install caliper-dev -D
npx caliper-mcp init
```

See [packages/caliper-dev](packages/caliper-dev#readme) for usage.

## Development

```bash
npm install
npm run dev        # builds both packages and serves http://localhost:4848/demo
```

Notes on how it works:

- Previews are `!important` rules in one `<style id="caliper-overrides">`, keyed by a structural selector (this element) or a class selector (all matching). They survive React re-renders and HMR; a structural selector can drift if the DOM above it changes.
- "From" values are computed styles at the current viewport. On responsive sites, say in the note if a change is for one breakpoint only.
- Hover/focus states aren't editable yet.

## License

[PolyForm Shield 1.0.0](LICENSE)
