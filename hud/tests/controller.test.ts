import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import type { BrowserChessEngine } from '../../src/lib/browserEngine';
import { HudController } from '../core/controller';
import { BridgeReceiver, localOrigin } from '../core/bridgeReceiver';

const a = new Chess().fen(); const board = new Chess(); board.move('e4'); const b = board.fen();
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function main() {
  let disposed = 0, searches = 0, announcements = 0;
  const jobs: { resolve: (value: { brilliant: boolean }) => void; signal: AbortSignal }[] = [];
  const controller = new HudController(() => ({ dispose() { disposed++; } } as BrowserChessEngine), async (_fen, _engine, signal) => {
    searches++; return new Promise(resolve => jobs.push({ resolve, signal }));
  }, (_state, notify) => { if (notify) announcements++; });
  controller.accept(a); assert.equal(controller.state.status, 'checking');
  controller.accept(a); assert.equal(searches, 1, 'identical heartbeat does not restart work');
  controller.accept(b); assert(jobs[0].signal.aborted); assert(disposed > 0);
  jobs[0].resolve({ brilliant: true }); await tick();
  assert.equal(controller.state.idea, false, 'late positive from obsolete job cannot leak');
  jobs[1].resolve({ brilliant: true }); await tick(); assert(controller.state.idea); assert.equal(announcements, 1);
  controller.accept(b); controller.accept(b);
  assert(controller.state.idea, 'Repeated readings of a checked positive position keep the visual signal');
  assert.equal(announcements, 1, 'Repeated readings do not play another notification');
  assert.equal(controller.notificationHistory.length, 1);
  assert.equal(controller.notificationHistory[0].fen, b, 'Troubleshooting records the actual signaled position');
  const diagnostic = controller.notificationHistory; diagnostic[0].fen = 'modified';
  assert.equal(controller.notificationHistory[0].fen, b, 'Copied diagnostics cannot mutate internal history');
  controller.accept(null); assert.equal(controller.state.idea, false); assert.equal(controller.state.status, 'unknown');
  controller.accept(b); assert.equal(searches, 2); assert.equal(controller.state.idea, false, 'cached repeated position does not announce twice');
  controller.setPaused(true); controller.accept(a); assert.equal(controller.state.status, 'paused');
  controller.setPaused(false); controller.accept(a); assert.equal(searches, 3);
  controller.dispose(); jobs[2].resolve({ brilliant: true }); await tick(); assert.equal(announcements, 1);

  let attempts = 0;
  const retry = new HudController(() => ({ dispose() {} } as BrowserChessEngine), async () => {
    if (++attempts === 1) throw Error('Engine crashed'); return { brilliant: false };
  }, () => {}, 1);
  retry.accept(a); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(attempts, 2); assert.equal(retry.state.status, 'checked'); retry.dispose();
  const failed = new HudController(() => ({ dispose() {} } as BrowserChessEngine), async () => { throw Error('Failed'); }, () => {}, 1);
  failed.accept(a); await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(failed.state.status, 'error'); assert(!failed.state.idea); failed.dispose();
  let cappedAttempts = 0;
  const capped = new HudController(() => ({ dispose() {} } as BrowserChessEngine), async () => {
    cappedAttempts++; throw Object.assign(Error('Insufficient depth'), { retryable: false });
  }, () => {}, 1);
  capped.accept(a); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(cappedAttempts, 1, 'A deterministic depth/node cap is not repeated at the same budget');
  assert.equal(capped.state.status, 'error'); assert(!capped.state.idea); capped.dispose();

  const token = 'a'.repeat(64); let result: string | null = null;
  const receiver = new BridgeReceiver(token, fen => { result = fen; });
  let sequence = 0;
  const send = (fen: string | null, now: number, session = 'session-one') => receiver.receive({ token, session, sequence: ++sequence, fen, orientation: 'white', sentAt: now }, now);
  assert(send(a, 1000)); assert.equal(result, null); send(a, 1500); send(a, 2000); assert.equal(result, a);
  send(b, 2100); assert.equal(result, null, 'first changed message immediately clears');
  send(b, 2600); send(b, 3100); assert.equal(result, b);
  send(a, 3200, 'session-two'); assert.equal(receiver.status, 'conflict'); assert.equal(result, null);
  receiver.tick(5101); assert.equal(receiver.status, 'waiting'); assert.equal(result, null);
  assert.equal(receiver.receive({ token: 'é'.repeat(64) }, 5102), false);
  assert.equal(receiver.receive({ token, session: 'session-one', sequence: 99, fen: a, orientation: 'white', sentAt: 0 }, 6000), false);
  send(a, 7000); send(a, 7500); send(a, 8000); assert.equal(result, a); receiver.tick(9801); assert.equal(result, null, 'source expiry withdraws result');
  receiver.reset(); assert.equal(result, null);
  assert(localOrigin('http://localhost:3000')); assert(localOrigin('http://127.0.0.1:3001'));
  for (const origin of ['https://example.com', 'http://localhost.evil:3000', 'null', 'file://', 'http://127.0.0.1@evil']) assert(!localOrigin(origin));
  console.log('HUD controller/bridge PASS: stale results, immediate withdrawal, one-shot cache, pause, recovery, heartbeat, conflict, origin/auth.');
}
void main();
