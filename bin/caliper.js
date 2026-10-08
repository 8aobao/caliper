#!/usr/bin/env node
import { startServer, DEFAULT_PORT } from '../src/server.js';
import { runMcp } from '../src/mcp.js';
import * as store from '../src/store.js';
import { formatChange } from '../src/format.js';

const [cmd = 'server', ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'server': {
    const s = await startServer();
    if (!s) {
      console.error(`caliper ▸ port ${DEFAULT_PORT} is already in use (another Caliper server, likely the MCP one). Nothing to do.`);
      process.exit(0);
    }
    break;
  }
  case 'mcp':
    await runMcp();
    break;
  case 'pending': {
    const list = store.list(['pending', 'acknowledged']);
    console.log(list.length ? list.map(formatChange).join('\n\n---\n\n') : 'No pending Caliper changes.');
    break;
  }
  case 'resolve': {
    const [id, ...summary] = rest;
    console.log(store.patch(id, { status: 'resolved', reply: summary.join(' ') || null }) ? `Resolved ${id}` : `No change ${id}`);
    break;
  }
  default:
    console.log(`caliper — live style tuning for the browser, handed to your agent

  caliper [server]          serve the browser client + change queue on :${DEFAULT_PORT}
  caliper mcp               MCP server for agents (also hosts the HTTP server if the port is free)
  caliper pending           print pending changes
  caliper resolve <id> [..] mark a change applied`);
}
