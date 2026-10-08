// Agent side: a minimal MCP server over stdio (newline-delimited JSON-RPC, no dependencies).
// It also hosts the HTTP server when nothing else is on the port, so registering the MCP server
// is the only setup: the browser client works whenever an agent session is open.
import readline from 'node:readline';
import fs from 'node:fs';
import * as store from './store.js';
import { startServer } from './server.js';
import { formatChange, AGENT_GUIDE } from '../../caliper-dev/src/format.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOOLS = [
  {
    name: 'caliper_pending',
    description:
      'List design changes the designer made live in the browser with Caliper and sent to the agent (pending and in-progress). Marks them as acknowledged so the designer sees the agent is on it.',
    inputSchema: {
      type: 'object',
      properties: { origin: { type: 'string', description: 'Only changes from this origin, e.g. http://localhost:3000' } },
    },
  },
  {
    name: 'caliper_watch',
    description:
      'Block until the designer sends new Caliper changes (or the timeout passes), then return them. Use in a loop for "watch mode": apply each change, resolve it, watch again.',
    inputSchema: {
      type: 'object',
      properties: {
        timeout_seconds: { type: 'number', description: 'How long to wait (default 120, max 600).' },
        origin: { type: 'string' },
      },
    },
  },
  {
    name: 'caliper_resolve',
    description: 'Mark a Caliper change as applied in source. Its live override is then removed in the browser.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, summary: { type: 'string', description: 'One line on what you changed, shown to the designer.' } },
      required: ['id'],
    },
  },
  {
    name: 'caliper_dismiss',
    description: "Decline a Caliper change (e.g. it conflicts with the design system). The designer's preview stays and they see your reason.",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, reason: { type: 'string' } },
      required: ['id', 'reason'],
    },
  },
];

function takeChanges(statuses, origin) {
  return store.update((db) => {
    const found = db.changes.filter((c) => statuses.includes(c.status) && (!origin || c.origin === origin));
    for (const c of found) if (c.status === 'pending') Object.assign(c, { status: 'acknowledged', updatedAt: Date.now() });
    return found;
  });
}

const render = (changes) =>
  changes.length
    ? `${changes.length} Caliper change(s):\n\n${changes.map(formatChange).join('\n\n---\n\n')}\n\n${AGENT_GUIDE}`
    : 'No pending Caliper changes.';

async function callTool(name, args = {}) {
  switch (name) {
    case 'caliper_pending':
      return render(takeChanges(['pending', 'acknowledged'], args.origin));
    case 'caliper_watch': {
      const until = Date.now() + Math.min(Number(args.timeout_seconds) || 120, 600) * 1000;
      while (Date.now() < until) {
        if (store.list(['pending']).some((c) => !args.origin || c.origin === args.origin))
          return render(takeChanges(['pending'], args.origin));
        await sleep(800);
      }
      return 'No new Caliper changes before the timeout. Call caliper_watch again to keep watching.';
    }
    case 'caliper_resolve': {
      const c = store.patch(args.id, { status: 'resolved', reply: args.summary || null });
      return c ? `Resolved ${args.id}.` : `No change with id ${args.id}.`;
    }
    case 'caliper_dismiss': {
      const c = store.patch(args.id, { status: 'dismissed', reply: args.reason });
      return c ? `Dismissed ${args.id}.` : `No change with id ${args.id}.`;
    }
    default:
      throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 });
  }
}

async function handle(msg) {
  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: msg.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'caliper', version: VERSION },
        instructions:
          'Caliper lets the designer tune element styles live in the browser and send them here. When the user mentions Caliper changes, call caliper_pending (or caliper_watch for watch mode), apply them in source, then caliper_resolve each one.',
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const text = await callTool(msg.params?.name, msg.params?.arguments);
      return { content: [{ type: 'text', text }] };
    }
    default:
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 });
  }
}

// `server`: HTTP + MCP over stdio in one process, like agentation-mcp. Run by an agent, stdio
// carries MCP and the process ends with the session; run in a terminal (or in the background with
// no stdin), it just keeps serving HTTP.
export async function runMcp() {
  const hosting = await startServer({ log: (...a) => console.error(...a) }); // null if another one already runs
  let spoke = false;
  const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    spoke = true;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === undefined || msg.id === null) return; // notification
    try {
      out({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) });
    } catch (err) {
      out({ jsonrpc: '2.0', id: msg.id, error: { code: err.code || -32603, message: String(err.message || err) } });
    }
  });
  rl.on('close', () => {
    if (spoke || !hosting) process.exit(0);
  });
}
