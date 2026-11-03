import assert from 'node:assert/strict';
import { RushController, type SearchEngine } from '../core/controller';
import { createRushServer } from '../core/server';
import type { RushResult } from '../core/engine';
const fen = 'rnb1k1nr/pppp1ppq/4p3/b3N1pQ/4P2P/2PP4/PP3PP1/RN2KB1R w - - 0 1';
async function main() {
  let jobs = 0, release: ((result: RushResult) => void) | null = null;
  const engine: SearchEngine = { ready: async () => {}, search: () => { jobs++; return new Promise(resolve => { release = resolve; }); }, cancel() {}, dispose() {} };
  const controller = new RushController(engine, () => {}), key = 'b'.repeat(64);
  let connection = false;
  const server = createRushServer(controller, key, value => { connection = value; });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/analyze`;
  let sequence = 0;
  const sample = (extra: Record<string, unknown> = {}) => ({ token: key, session: 'test-session', sequence: ++sequence, fen, positionId: `position-${sequence}`, visible: true, sentAt: Date.now(), ...extra });
  const post = (body: unknown, header = 'a'.repeat(32)) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nonchalant-Extension': header }, body: JSON.stringify(body) });
  try {
    assert.equal((await post(sample({ token: 'c'.repeat(64) }))).status, 401);
    assert.equal((await post(sample(), 'invalid')).status, 403);
    assert.equal((await post(sample({ sentAt: 0 }))).status, 400);
    assert.equal(jobs, 0);
    const request = sample(); const pending = post(request);
    for (let i = 0; i < 50 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(jobs, 1); assert(connection);
    const withdrawn = await post(sample({ fen: null, visible: false })); assert.equal(withdrawn.status, 200); assert.equal((await withdrawn.json()).move, null);
    assert.equal(controller.state.fen, null); assert(!connection);
    (release as unknown as (result: RushResult) => void)({ move: 'h5f7', depth: 12, elapsedMs: 100, final: true, pv: ['h5f7'] });
    assert.equal((await pending).status, 422, 'superseded result cannot return a move');
    assert.equal((await post(request)).status, 409, 'old sequence cannot replace current position');
    assert.equal((await post(sample({ session: 'new-session', fen: null, visible: false }))).status, 200);
    assert.equal((await post(sample({ fen: null, visible: false }))).status, 409, 'retired session cannot reconnect late');
    const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: `chrome-extension://${'a'.repeat(32)}` } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), `chrome-extension://${'a'.repeat(32)}`);
    assert.equal((await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://www.chess.com' } })).status, 403);
    console.log('Rush loopback PASS: authentication, extension origin, sequence and session fencing, expired samples, withdrawal supersedes a busy search, CORS.');
  } finally { controller.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
