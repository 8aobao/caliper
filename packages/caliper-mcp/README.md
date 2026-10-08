# Caliper MCP

The server for [Caliper](https://www.npmjs.com/package/caliper-dev): it receives the style changes a designer makes live in the browser and hands them to your coding agent over MCP.

## Installation

```bash
npm install caliper-mcp -D
```

## Quick start

### 1. Set up the MCP server

```bash
npx caliper-mcp init
```

or add it to Claude Code yourself:

```bash
claude mcp add -s user caliper -- npx -y caliper-mcp server
```

### 2. Start the server

Your agent starts it with each session. To run it on its own:

```bash
npx caliper-mcp server
```

This starts both:

- **HTTP server** (port 4848): serves the toolbar's endpoint, the script-tag build at `/caliper.js`, and a demo at `/demo`
- **MCP server** (stdio): the tools below, for your agent

### 3. Verify your setup

```bash
npx caliper-mcp doctor
```

Then send a change from the toolbar and ask your agent to "check Caliper".

## Tools

| Tool | |
|---|---|
| `caliper_pending` | Changes sent from the browser and not yet applied (marks them acknowledged, so the designer sees the agent is on it) |
| `caliper_watch` | Wait until new changes arrive, then return them (watch mode) |
| `caliper_resolve` | Mark a change applied in code; its preview clears in the browser |
| `caliper_dismiss` | Decline a change with a reason the designer sees |

Each change carries the page and viewport, the element (tag, classes, text, selector, React component names), every value before → after with a Tailwind suggestion, the CSS override behind the preview, and the designer's note.

## HTTP API

`GET /pending` · `GET /changes` · `GET /changes/:id` · `PATCH /changes/:id {"status":"resolved","reply":"…"}` · `GET /events` (server-sent status updates). Changes live in `~/.caliper/store.json`; finished ones are pruned after a week.

## Options

- `CALIPER_PORT`: port (default 4848)
- `CALIPER_HOME`: where the change queue lives (default `~/.caliper`)

## License

[PolyForm Shield 1.0.0](./LICENSE). Free to use, modify and share, except to build a product that competes with Caliper.
