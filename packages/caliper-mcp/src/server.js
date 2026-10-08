// HTTP side: serves the browser client, receives changes from it, and streams status updates
// (pending → acknowledged → resolved/dismissed) back so previews clear once the agent lands them.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PORT = Number(process.env.CALIPER_PORT) || 4848;
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// The toolbar's script-tag build: shipped in dist/ when published; in the repo, read from the
// sibling caliper-dev package's build.
const CLIENT_PATHS = [path.join(ROOT, 'dist/caliper.global.js'), path.join(ROOT, '../caliper-dev/dist/caliper.global.js')];
function clientSource() {
  for (const p of CLIENT_PATHS) if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  throw new Error('Toolbar build not found. Run `npm run build` in the Caliper repo.');
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

const brief = (c) => ({ id: c.id, status: c.status, reply: c.reply || null, updatedAt: c.updatedAt });

export const VERSION_STRING = VERSION;
export function startServer({ port = DEFAULT_PORT, log = (...a) => console.error(...a) } = {}) {
  const clients = new Set();
  let last = new Map();

  // Changes can also be written by the MCP process, so watch the store rather than only
  // broadcasting our own writes.
  const poll = setInterval(() => {
    if (!clients.size) return;
    const now = new Map(store.list().map((c) => [c.id, brief(c)]));
    for (const [id, b] of now) {
      const prev = last.get(id);
      if (!prev || prev.status !== b.status || prev.updatedAt !== b.updatedAt) broadcast('change', b);
    }
    for (const id of last.keys()) if (!now.has(id)) broadcast('change', { id, status: 'deleted' });
    last = now;
  }, 700);
  poll.unref();

  function broadcast(event, data) {
    for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-private-network', 'true');
    if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');

    try {
      if (p === '/caliper.js') return send(res, 200, clientSource(), 'text/javascript; charset=utf-8');
      if (p === '/demo' || p === '/demo/')
        return send(res, 200, fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8'), 'text/html; charset=utf-8');
      if (p === '/health') return send(res, 200, { ok: true, name: 'caliper', version: VERSION });
      if (p === '/') return send(res, 200, help(port), 'text/html; charset=utf-8');

      if (p === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        const snapshot = store.list().map(brief);
        res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
        if (!clients.size) last = new Map(snapshot.map((b) => [b.id, b]));
        clients.add(res);
        const ka = setInterval(() => res.write(': ka\n\n'), 15000);
        req.on('close', () => {
          clearInterval(ka);
          clients.delete(res);
        });
        return;
      }

      if (p === '/pending' && req.method === 'GET') return send(res, 200, store.list(['pending', 'acknowledged']));

      if (p === '/changes') {
        if (req.method === 'GET') {
          const status = url.searchParams.get('status');
          return send(res, 200, store.list(status ? status.split(',') : null));
        }
        if (req.method === 'POST') {
          const body = await readBody(req);
          const now = Date.now();
          const c = store.update((db) => {
            const c = { ...body, id: store.newId(), status: 'pending', reply: null, createdAt: now, updatedAt: now };
            db.changes.push(c);
            return c;
          });
          log(`caliper ▸ new change ${c.id}: ${c.element?.label || ''} (${c.changes?.length || 0} props)`);
          return send(res, 201, c);
        }
      }

      const m = p.match(/^\/changes\/([\w-]+)$/);
      if (m) {
        const id = m[1];
        if (req.method === 'GET') {
          const c = store.list().find((x) => x.id === id);
          return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
        }
        if (req.method === 'PUT') {
          // Re-send after further tweaking: replace the content, back in the queue.
          const body = await readBody(req);
          const c = store.update((db) => {
            const i = db.changes.findIndex((x) => x.id === id);
            if (i < 0) return null;
            db.changes[i] = { ...body, id, status: 'pending', reply: null, createdAt: db.changes[i].createdAt, updatedAt: Date.now() };
            return db.changes[i];
          });
          return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
        }
        if (req.method === 'PATCH') {
          const { status, reply } = await readBody(req);
          const c = store.patch(id, { ...(status && { status }), ...(reply !== undefined && { reply }) });
          return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
        }
        if (req.method === 'DELETE') {
          store.update((db) => (db.changes = db.changes.filter((x) => x.id !== id)));
          return send(res, 200, { ok: true });
        }
      }
      send(res, 404, { error: 'not found' });
    } catch (err) {
      send(res, 500, { error: String(err.message || err) });
    }
  }

  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.on('error', (err) => {
      if (err.code !== 'EADDRINUSE') log('caliper ▸', err.message);
      resolve(null);
    });
    server.listen(port, '127.0.0.1', () => {
      log(`caliper ▸ http://localhost:${port}  (store: ${store.STORE_FILE})`);
      resolve(server);
    });
  });
}

function help(port) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const react = `npm i -D caliper-dev\n\nimport { Caliper } from "caliper-dev";\n// in your root layout, development only:\n{process.env.NODE_ENV === "development" && <Caliper endpoint="http://localhost:${port}" />}`;
  const tag = `<script src="http://localhost:${port}/caliper.js" defer></script>`;
  return `<!doctype html><meta charset="utf-8"><title>Caliper</title>
<style>body{font:15px/1.5 system-ui;max-width:640px;margin:60px auto;padding:0 16px;color:#222}code,pre{background:#f3f3f3;border-radius:6px;padding:2px 6px}pre{padding:12px;overflow:auto}</style>
<h1>Caliper server is running</h1>
<p>React (Next.js, Vite…):</p>
<pre>${esc(react)}</pre>
<p>Any other site, a script tag in development:</p>
<pre>${esc(tag)}</pre>
<p>Try it on the <a href="/demo">demo page</a>: press <b>⌥C</b> or click the circle.</p>`;
}
