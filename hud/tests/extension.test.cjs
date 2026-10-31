// Exercise the actual service-worker file with isolated Chrome transport APIs.
// In particular, a slow fetch must never hold newer position withdrawals behind it.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const id = 'a'.repeat(32), base = `chrome-extension://${id}/`;
const store = {}, requests = [], controls = [];
let listener;
const tick = () => new Promise(r => setTimeout(r, 0));
const chrome = {
  runtime: { id, getURL: file => base + file, onMessage: { addListener: fn => { listener = fn; } } },
  storage: { session: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in store).map(k => [k, structuredClone(store[k])])),
    set: async values => Object.assign(store, structuredClone(values)),
    remove: async key => { delete store[key]; },
  } },
  tabs: {
    query: async () => [{ id: 7, active: true, url: 'https://www.chess.com/game/live/12345' }],
    sendMessage: async (tab, message) => { controls.push({ tab, message }); },
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8'), {
  chrome, URL, AbortController, setTimeout, clearTimeout, crypto: { randomUUID },
  fetch: (url, options) => new Promise((resolve, reject) => {
    requests.push({ url, options, body: JSON.parse(options.body), resolve });
    options.signal.addEventListener('abort', () => reject(Error('Aborted')), { once: true });
  }),
});
const popup = { id, url: base + 'popup.html' };
const tab = { id, url: 'https://www.chess.com/game/live/12345', frameId: 0, tab: { id: 7, active: true } };
const send = (message, sender = popup) => new Promise(resolve => listener(message, sender, resolve));
async function main() {
  assert.equal((await send({ kind: 'connect', token: 'short', startFen: 'ignored' })).ok, false);
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert((await send({ kind: 'connect', token: 'b'.repeat(64), startFen })).ok);
  assert.equal(controls[0].message.kind, 'start');
  assert.equal((await send({ kind: 'hello' }, tab)).enabled, true);
  assert(!JSON.stringify(await send({ kind: 'hello' }, tab)).includes('bbbb'), 'No pairing secret is sent to page content');
  const sample = { kind: 'moves', game: tab.url, moves: [{ ply: 1, san: 'e4' }], currentPly: 1, visible: true, ready: true, observedAt: Date.now() };
  await send(sample, tab);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:18319/moves');
  assert.equal(requests[0].options.headers['X-Nonchalant-Extension'], id);
  assert.equal(requests[0].body.startFen, startFen);
  assert.equal(requests[0].body.visible, true);
  const firstSequence = requests[0].body.sequence;
  await send({ ...sample, ready: false, observedAt: Date.now() }, tab);
  assert.equal(requests.length, 2, 'A newer withdrawal is dispatched while the previous network call is still pending');
  assert(requests[0].options.signal.aborted, 'Superseded network request is aborted');
  assert.equal(requests[1].body.ready, false);
  assert(requests[1].body.sequence > firstSequence);
  requests[1].resolve({ ok: true, json: async () => ({ ok: true, detail: 'latest-state' }) });
  await tick(); await tick();
  assert.equal(store.status.detail, 'latest-state');
  await send({ ...sample, observedAt: 0 }, tab);
  await send(sample, { ...tab, tab: { id: 8, active: true } });
  await send(sample, { ...tab, url: 'https://www.chess.com.evil/game' });
  await send(sample, { ...tab, frameId: 1 });
  assert.equal(requests.length, 2, 'Unpaired frames, wrong sites and stale observations cannot send positions');
  await send({ ...sample, observedAt: Date.now() }, { ...tab, tab: { id: 7, active: false } });
  assert.equal(requests.at(-1).body.visible, false, 'A background tab never asserts a current visible position');
  await send({ kind: 'disconnect' });
  assert.equal(requests.at(-1).body.visible, false);
  assert.equal(store.connection, undefined);
  assert.equal((await send({ kind: 'hello' }, tab)).enabled, false);
  requests.at(-1).resolve({ ok: true, json: async () => ({ ok: true, detail: 'obsolete-response' }) });
  await tick(); await tick();
  assert.equal(store.status.detail, 'Отключено.', 'An obsolete response cannot overwrite disconnect state');
  console.log('Extension transport PASS: popup pairing, fixed loopback endpoint, private token, one tab, authentication context, monotonic sequences, hidden tabs, stale snapshots, slow-request cancellation, stale-response rejection.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
