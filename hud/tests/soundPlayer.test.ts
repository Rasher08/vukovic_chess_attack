import assert from 'node:assert/strict';
import type { SoundSettings } from '../core/soundStore';
import { NotificationSoundPlayer, shouldStopSound } from '../ui/sound';

const settings: SoundSettings = {
  enabled: true, volume: 45, duration: 0, stopOnMove: false,
  activeIds: ['track-a'], includeTone: false,
  selection: 'selected', selectedId: 'track-a', tracks: [{ id: 'track-a', name: 'A.mp3' }],
  name: 'A.mp3', revision: 'selected:track-a',
};
const position = { mode: 'direct' as const, status: 'checked' as const, revision: 8, sound: true, soundSettings: settings };
assert.equal(shouldStopSound(undefined, position), false);
assert.equal(shouldStopSound(position, { ...position, status: 'checking', revision: 9 }), false,
  'Allow a track to finish across the next valid position when stop on move is off');
assert.equal(shouldStopSound(position, { ...position, revision: 9 }), false,
  'Finishing another position check must not cut off that track');
const opponent = { ...position, status: 'opponent' as const, revision: 9 };
assert.equal(shouldStopSound(position, opponent), false, 'The opponent turn remains a valid connected position when music may continue across moves');
assert.equal(shouldStopSound(opponent, { ...position, status: 'checking', revision: 10 }), false,
  'Returning to our turn also preserves music when stop on move is disabled');
const stopOnMove = { ...position, soundSettings: { ...settings, stopOnMove: true } };
assert.equal(shouldStopSound(stopOnMove, { ...stopOnMove, revision: 9, status: 'checking' }), true);
assert.equal(shouldStopSound(stopOnMove, { ...stopOnMove, revision: 9, status: 'opponent' }), true,
  'An opponent turn is still a move when stop on move is enabled');
assert.equal(shouldStopSound(stopOnMove, { ...stopOnMove }), false,
  'A layout or other unchanged-state broadcast is not a move');
for (const status of ['unknown', 'error', 'paused'] as const) {
  assert.equal(shouldStopSound(position, { ...position, status }), true, `Stop for unavailable source / ${status}`);
  assert.equal(shouldStopSound(opponent, { ...opponent, status }), true, `An opponent turn cannot keep music alive after source loss / ${status}`);
}
assert.equal(shouldStopSound(position, { ...position, sound: false }), true);
assert.equal(shouldStopSound(position, { ...position, mode: 'moves' }), true);
for (const change of [{ volume: 60 }, { duration: 10 }, { selection: 'random' as const }, { selectedId: null }, { activeIds: [] }, { includeTone: true }]) {
  assert.equal(shouldStopSound(position, { ...position, soundSettings: { ...settings, ...change } }), true,
    'A changed playback setting withdraws old audio, including pending loads');
}
const disconnected = { ...position, status: 'unknown' as const, sound: false };
assert.equal(shouldStopSound(disconnected, { ...disconnected }, true), false,
  'Manual preview works before connecting a board or enabling notifications');
assert.equal(shouldStopSound(position, { ...position, status: 'paused' }, true), true);
assert.equal(shouldStopSound(position, { ...position, sound: false }, true), true);
assert.equal(shouldStopSound(position, opponent, true), false, 'Manual preview continues through a valid opponent turn');
assert.equal(shouldStopSound(opponent, { ...position, status: 'checking', revision: 10 }, true), false);

// Exercise actual audio lifecycle with a deterministic media device and clock.
// No sound files are installed in the app or read by these tests.
class TestAudio {
  static instances: TestAudio[] = [];
  static nextPlay: (() => Promise<void>) | undefined;
  paused = true;
  loop = true;
  volume = 1;
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  cleared = false;
  constructor(src = '') { this.src = src; TestAudio.instances.push(this); }
  play() {
    this.paused = false;
    const play = TestAudio.nextPlay; TestAudio.nextPlay = undefined;
    return play ? play() : Promise.resolve();
  }
  pause() { this.paused = true; }
  removeAttribute(name: string) { if (name === 'src') { this.src = ''; this.cleared = true; } }
  load() {}
  finish() { this.paused = true; this.onended?.(); }
}

async function main() {
  const nativeAudio = globalThis.Audio;
  const nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
  let now = 0, nextTimer = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  globalThis.Audio = TestAudio as unknown as typeof Audio;
  globalThis.setTimeout = ((run: () => void, delay = 0) => {
    const id = ++nextTimer; timers.set(id, { at: now + delay, run }); return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as unknown as typeof clearTimeout;
  const advance = (milliseconds: number) => {
    const until = now + milliseconds;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].run();
    }
    now = until;
  };
  let ended = 0;
  const player = new NotificationSoundPlayer(() => { ended++; });
  const asset = { name: 'user-track.mp3', dataUrl: 'data:audio/mpeg;base64,dGVzdA==' };
  try {
    await player.play(asset, settings);
    const full = TestAudio.instances.at(-1)!;
    assert(player.playing); assert.equal(full.volume, .45); assert.equal(full.loop, false);
    advance(20 * 60 * 1000);
    assert(player.playing, 'Full-track playback has no synthetic cutoff');
    assert.equal(timers.size, 0);
    full.finish();
    assert.equal(player.playing, false); assert(full.cleared); assert.equal(ended, 1);

    await player.play(asset, { volume: 80, duration: 12 });
    const limited = TestAudio.instances.at(-1)!;
    advance(11999); assert(player.playing);
    advance(1); assert.equal(player.playing, false); assert(limited.cleared); assert.equal(ended, 2);

    await player.play(asset, { volume: 80, duration: 600 });
    const short = TestAudio.instances.at(-1)!;
    short.finish();
    assert.equal(timers.size, 0, 'A short track finishes once without looping to fill the requested duration');
    advance(600000); assert.equal(ended, 3);

    let resolveOld!: () => void;
    TestAudio.nextPlay = () => new Promise<void>(resolve => { resolveOld = resolve; });
    const oldPlay = player.play(asset, { volume: 50, duration: 5 });
    const old = TestAudio.instances.at(-1)!, staleEnded = old.onended;
    player.stop();
    await player.play({ ...asset, name: 'another-user-track.mp3' }, { volume: 50, duration: 0 });
    const current = TestAudio.instances.at(-1)!;
    resolveOld(); await oldPlay; staleEnded?.();
    assert(player.playing); assert.equal(current.cleared, false);
    assert.equal(timers.size, 0, 'A late play promise cannot schedule the cancelled cutoff or stop new audio');
    assert.equal(ended, 3);
    player.stop(); assert(old.cleared); assert(current.cleared); assert.equal(player.playing, false);

    TestAudio.nextPlay = () => Promise.reject(Error('media rejected'));
    await assert.rejects(player.play(asset, { volume: 50, duration: 10 }), /media rejected/);
    assert.equal(player.playing, false); assert.equal(timers.size, 0);
    assert(TestAudio.instances.at(-1)!.cleared, 'Failed playback releases its media source');

    const count = TestAudio.instances.length;
    await player.play(asset, { volume: 0, duration: 10 });
    assert.equal(TestAudio.instances.length, count, 'Muted playback does not open an audio stream');
    console.log('PASS sound playback: move policy, full/numeric duration, natural end, no looping, stale callbacks, cleanup and mute.');
  } finally {
    player.stop(); globalThis.Audio = nativeAudio;
    globalThis.setTimeout = nativeSetTimeout; globalThis.clearTimeout = nativeClearTimeout;
  }
}
void main();
