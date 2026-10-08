#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { startServer, DEFAULT_PORT, VERSION_STRING } from './server.js';
import { runMcp } from './mcp.js';
import * as store from './store.js';
import { formatChange } from '../../caliper-dev/src/format.js';

const [cmd = 'server', ...rest] = process.argv.slice(2);
const ENDPOINT = `http://localhost:${DEFAULT_PORT}`;
const MCP_ADD = ['mcp', 'add', '-s', 'user', 'caliper', '--', 'npx', '-y', 'caliper-mcp', 'server'];
const hasClaude = () => spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0;
const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });

const SNIPPET = `  npm i -D caliper-dev

  // React (Next.js root layout, Vite App…), development only:
  import { Caliper } from "caliper-dev";
  {process.env.NODE_ENV === "development" && <Caliper endpoint="${ENDPOINT}" />}

  // Any other site:
  <script src="${ENDPOINT}/caliper.js" defer></script>`;

switch (cmd) {
  case 'server':
  case 'mcp':
    await runMcp();
    break;

  case 'init': {
    console.log(`\nCaliper setup\n\n1. Connect your agent`);
    if (hasClaude()) {
      const a = await ask(`   Register Caliper's MCP server with Claude Code (all projects)? [Y/n] `);
      if (!/^n/i.test(a)) {
        const r = spawnSync('claude', MCP_ADD, { stdio: 'inherit' });
        console.log(r.status === 0 ? '   ✓ Registered. It starts with your next Claude Code session.' : '   ✗ Registration failed; run it yourself:');
        if (r.status !== 0) console.log(`     claude ${MCP_ADD.join(' ')}`);
      } else console.log(`   Skipped. To do it later:\n     claude ${MCP_ADD.join(' ')}`);
    } else {
      console.log(`   Claude Code not found. For Claude Code:\n     claude ${MCP_ADD.join(' ')}`);
      console.log(`   Other MCP clients: run "npx -y caliper-mcp server" as a stdio MCP server.`);
    }
    console.log(`\n2. Add the toolbar to your app\n\n${SNIPPET}\n\n3. Check it: npx caliper-mcp doctor\n`);
    break;
  }

  case 'doctor': {
    const ok = (m) => console.log(`  ✓ ${m}`);
    const bad = (m, fix) => console.log(`  ✗ ${m}${fix ? `\n      → ${fix}` : ''}`);
    console.log(`\nCaliper doctor (caliper-mcp ${VERSION_STRING})\n`);
    const major = Number(process.versions.node.split('.')[0]);
    major >= 18 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node}`, 'Caliper needs Node 18 or newer');
    try {
      fs.mkdirSync(store.STORE_FILE.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
      fs.accessSync(store.STORE_FILE.replace(/[/\\][^/\\]+$/, ''), fs.constants.W_OK);
      ok(`Change queue: ${store.STORE_FILE}`);
    } catch (e) {
      bad(`Can't write the change queue (${store.STORE_FILE})`, e.message);
    }
    try {
      const h = await (await fetch(`${ENDPOINT}/health`, { signal: AbortSignal.timeout(1500) })).json();
      h.name === 'caliper' ? ok(`Server running at ${ENDPOINT} (v${h.version})`) : bad(`Port ${DEFAULT_PORT} is used by something else`, 'set CALIPER_PORT to another port');
    } catch {
      bad(`No server at ${ENDPOINT}`, 'run "npx caliper-mcp server", or open a Claude Code session if Caliper is registered');
    }
    if (hasClaude()) {
      const r = spawnSync('claude', ['mcp', 'get', 'caliper'], { encoding: 'utf8' });
      if (r.status !== 0) bad('Not registered with Claude Code', `claude ${MCP_ADD.join(' ')}`);
      else if (/fail|✘/i.test(r.stdout)) bad('Registered with Claude Code, but it fails to start', `claude mcp get caliper, then re-add: claude ${MCP_ADD.join(' ')}`);
      else ok('Registered with Claude Code');
    } else console.log('  · Claude Code not found (skip if you use another agent)');
    const pending = store.list(['pending', 'acknowledged']).length;
    console.log(`  · ${pending} change${pending === 1 ? '' : 's'} waiting for the agent`);
    console.log(`\n  End to end: select an element, change something, Send, then ask your agent to\n  "check Caliper" (it calls caliper_pending) and confirm it sees your change.\n`);
    break;
  }

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
    console.log(`caliper-mcp ${VERSION_STRING}: the server and agent tools for Caliper

  caliper-mcp server          HTTP server on :${DEFAULT_PORT} + MCP over stdio (what agents run)
  caliper-mcp init            connect Claude Code and show how to add the toolbar
  caliper-mcp doctor          check the setup
  caliper-mcp pending         print changes waiting for the agent
  caliper-mcp resolve <id>    mark a change applied

  CALIPER_PORT changes the port; CALIPER_HOME the queue's folder (default ~/.caliper).`);
}
