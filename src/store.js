// The change queue: one JSON file shared by the HTTP server (browser side) and the MCP server
// (agent side). Both re-read it on every access, so they can run as separate processes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = process.env.CALIPER_HOME || path.join(os.homedir(), '.caliper');
export const STORE_FILE = path.join(DIR, 'store.json');
const WEEK = 7 * 24 * 3600 * 1000;

export function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return { changes: [] };
  }
}

function save(db) {
  // Finished changes older than a week are dropped so the file stays small.
  db.changes = db.changes.filter(
    (c) => !['resolved', 'dismissed'].includes(c.status) || Date.now() - c.updatedAt < WEEK,
  );
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

export function update(fn) {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

export const newId = () => 'cal_' + Math.random().toString(36).slice(2, 8);

export function list(statuses) {
  const all = load().changes;
  return statuses ? all.filter((c) => statuses.includes(c.status)) : all;
}

export function patch(id, fields) {
  return update((db) => {
    const c = db.changes.find((x) => x.id === id);
    if (!c) return null;
    Object.assign(c, fields, { updatedAt: Date.now() });
    return c;
  });
}
