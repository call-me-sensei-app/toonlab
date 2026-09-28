import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const calls = [];
class Storage {
  data = new Map();
  get length() { return this.data.size; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
  removeItem(key) { this.data.delete(key); }
  key(index) { return [...this.data.keys()][index]; }
  clear() { this.data.clear(); }
}
let fails = false;
const context = {
  Storage, localStorage: new Storage(), TextEncoder,
  XMLHttpRequest: class {
    open() {} setRequestHeader() {}
    send() { this.status = 200; this.responseText = JSON.stringify({ initialized: true, entries: {} }); }
  },
  fetch: async (path, options) => {
    calls.push({ path, ...options });
    if (options.keepalive && new TextEncoder().encode(options.body ?? '').length > 65536) throw new Error('Keepalive quota');
    return { ok: !fails, status: fails ? 503 : 200 };
  },
  console: { error() {} }, CustomEvent: class {}, dispatchEvent() {},
};
runInNewContext(readFileSync(new URL('../labs/shared/workspace-bootstrap.js', import.meta.url), 'utf8'), context);
context.localStorage.setItem('toonlab.rockGeneration.draft.v2', 'x'.repeat(5_500_000));
assert.equal(await context.__TOONLAB_WORKSPACE__.flush(), true);
assert.equal(calls[0].keepalive, false, 'dense meshes must not hit the keepalive body quota');
context.localStorage.setItem('toonlab.small', 'ok');
assert.equal(await context.__TOONLAB_WORKSPACE__.flush(), true);
assert.equal(calls[1].keepalive, true);
fails = true;
context.localStorage.setItem('toonlab.small', 'error');
assert.equal(await context.__TOONLAB_WORKSPACE__.flush(), false, 'HTTP failures must reach the caller');
fails = false;
context.localStorage.setItem('toonlab.small', 'recovered');
assert.equal(await context.__TOONLAB_WORKSPACE__.flush(), true);
console.log('Workspace large-draft persistence: body quota, HTTP failures, and recovery passed.');
