import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SoundStore, MAX_SOUND_BYTES, MAX_SOUND_TRACKS, MAX_SOUND_LIBRARY_BYTES } from '../core/soundStore';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sound-'));
function fixture(name: string, bytes = name) {
  const file = path.join(directory, name); fs.writeFileSync(file, bytes); return file;
}
function legacy() {
  const folder = path.join(directory, 'legacy'); fs.mkdirSync(folder);
  const id = randomUUID(), content = Buffer.from('previous user audio');
  fs.writeFileSync(path.join(folder, `sound-${id}`), content);
  const raw = JSON.stringify({ enabled: true, volume: 57, duration: 10, asset: { id, name: 'my-phrase.mp3', mime: 'audio/mpeg' } });
  fs.writeFileSync(path.join(folder, 'sound.json'), raw);
  const store = new SoundStore(folder);
  assert.equal(store.settings.name, 'my-phrase.mp3'); assert.equal(store.settings.selectedId, id);
  assert.deepEqual(store.settings.tracks, [{ id, name: 'my-phrase.mp3' }]);
  assert.equal(store.settings.stopOnMove, true); assert.equal(store.settings.selection, 'selected');
  assert.equal(store.read()?.dataUrl, `data:audio/mpeg;base64,${content.toString('base64')}`);
  assert.equal(fs.readFileSync(path.join(folder, 'sound.json'), 'utf8'), raw, 'Reading legacy settings does not eagerly rewrite user files');
  store.configure({ duration: 0, stopOnMove: false });
  const migrated = JSON.parse(fs.readFileSync(path.join(folder, 'sound.json'), 'utf8'));
  assert.equal(migrated.version, 2); assert.equal(migrated.asset, undefined); assert.equal(migrated.tracks[0].id, id);
  const restored = new SoundStore(folder);
  assert.deepEqual(restored.settings, store.settings, 'Duration, stop condition and original track survive migration and restart');
  restored.reset();
  assert.equal(restored.read(), null); assert.equal(restored.settings.tracks.length, 1, 'Standard tone does not erase the music library');
  assert(fs.existsSync(path.join(folder, `sound-${id}`)));
  restored.configure({ selection: 'random' }); assert.equal(restored.read()?.name, 'my-phrase.mp3', 'Random uses uploaded music even after switching to standard tone');
  restored.remove(id); assert.equal(restored.settings.tracks.length, 0); assert.equal(restored.read(), null);
  assert(!fs.existsSync(path.join(folder, `sound-${id}`)));
}
function library() {
  const folder = path.join(directory, 'library');
  const randoms = [0, 0.999999, 0.5];
  const store = new SoundStore(folder, { random: () => randoms.shift()! });
  assert.equal(store.settings.enabled, false); assert.equal(store.settings.duration, 5); assert.equal(store.settings.stopOnMove, true);
  assert.equal(store.read(), null);
  const a = store.stage(fixture('first.mp3')), b = store.stage(fixture('second.wav'));
  assert.equal(store.settings.tracks.length, 0, 'Unvalidated choices do not change the library');
  assert.throws(() => store.confirm('arbitrary-id'));
  assert.throws(() => store.stage(fixture('web-link.txt', 'https://music.example')));
  store.confirm(a.id); store.confirm(b.id);
  const c = store.stage(fixture('third.ogg')); store.confirm(c.id);
  assert.equal(store.settings.tracks.length, 3); assert.equal(store.settings.name, c.name);
  fs.rmSync(path.join(directory, 'first.mp3'));
  assert.equal(store.read(a.id)?.dataUrl, a.dataUrl, 'Managed copies survive removal of source files');
  store.configure({ enabled: true, volume: 42, duration: 73, stopOnMove: false, selectedId: a.id });
  assert.equal(store.settings.selection, 'selected'); assert.equal(store.read()?.name, a.name);
  store.configure({ selection: 'random' });
  assert.deepEqual([store.read()?.name, store.read()?.name, store.read()?.name], [a.name, c.name, b.name], 'Each random read samples the entire library, not a cached first track');
  assert.equal(store.settings.selectedId, a.id, 'Random playback does not overwrite the manual selection');
  assert.equal(store.read(b.id)?.name, b.name, 'Explicit preview is exact even in random mode');
  assert.throws(() => store.read('unknown'));
  const before = store.settings;
  assert.throws(() => store.configure({ selectedId: 'unknown', volume: 12 })); assert.deepEqual(store.settings, before);
  store.configure({ duration: 999, volume: -1, selectedId: undefined }); assert.deepEqual(store.settings, before);
  const detached = store.settings; detached.tracks[0].name = 'changed'; assert.equal(store.settings.tracks[0].name, a.name);
  const asset = store.read(a.id)!; asset.name = 'changed'; assert.equal(store.read(a.id)?.name, a.name);
  store.configure({ selectedId: b.id }); assert.equal(store.settings.selection, 'selected');
  store.remove(b.id); assert.equal(store.settings.selectedId, a.id); assert.equal(store.settings.tracks.length, 2);
  assert.equal(store.read()?.name, a.name);
  const restored = new SoundStore(folder);
  assert.deepEqual(restored.settings, store.settings);
  assert.equal(restored.read(c.id)?.dataUrl, c.dataUrl);
  fs.rmSync(path.join(folder, `sound-${a.id}`));
  const missing = new SoundStore(folder);
  assert.deepEqual(missing.settings.tracks, [{ id: c.id, name: c.name }]);
  assert.equal(missing.settings.selectedId, c.id, 'A missing selected asset falls back within the surviving library');
  assert.equal(missing.read()?.name, c.name);
  const failed = missing.stage(fixture('invalid-media.mp3')); missing.discard(failed.id);
  assert.throws(() => missing.confirm(failed.id), 'Failed media validation discards its staged bytes');
}
function failedWrites() {
  const folder = path.join(directory, 'failed-write'), store = new SoundStore(folder);
  const first = store.stage(fixture('saved.wav')); store.confirm(first.id);
  const config = path.join(folder, 'sound.json'); const raw = fs.readFileSync(config, 'utf8'), settings = store.settings;
  const next = store.stage(fixture('new.wav'));
  fs.mkdirSync(config + '.tmp');
  assert.throws(() => store.confirm(next.id));
  assert.equal(fs.readFileSync(config, 'utf8'), raw); assert.deepEqual(store.settings, settings);
  assert(!fs.existsSync(path.join(folder, `sound-${next.id}`)), 'Failed persistence removes only the new managed file');
  assert(fs.existsSync(path.join(folder, `sound-${first.id}`)));
  assert.throws(() => store.configure({ volume: 99 })); assert.equal(fs.readFileSync(config, 'utf8'), raw);
  fs.rmSync(config + '.tmp', { recursive: true });
  store.confirm(next.id); assert.equal(new SoundStore(folder).settings.tracks.length, 2, 'A failed write can be retried without losing the staged choice');
}
function protection() {
  for (const [name, raw] of [['future', JSON.stringify({ version: 99, tracks: [] })], ['broken', '{broken'], ['invalid', JSON.stringify({ version: 2, tracks: 'not-an-array' })]]) {
    const folder = path.join(directory, name); fs.mkdirSync(folder); const file = path.join(folder, 'sound.json'); fs.writeFileSync(file, raw);
    const store = new SoundStore(folder);
    assert.equal(store.settings.enabled, false); assert.equal(store.read(), null);
    assert.throws(() => store.configure({ enabled: true })); assert.throws(() => store.reset());
    assert.throws(() => store.stage(path.join(directory, 'new.wav')));
    assert.equal(fs.readFileSync(file, 'utf8'), raw, 'Unknown or corrupted formats remain recoverable');
  }
  const folder = path.join(directory, 'unsafe-id'); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'sound.json'), JSON.stringify({ enabled: true, volume: -1, duration: 999, asset: { id: '../../secret', name: 'secret', mime: 'audio/mpeg' } }));
  const unsafe = new SoundStore(folder);
  assert.equal(unsafe.settings.volume, 35); assert.equal(unsafe.settings.duration, 5); assert.equal(unsafe.settings.tracks.length, 0);
}
function limits() {
  const store = new SoundStore(path.join(directory, 'limits'));
  const file = fixture('small.wav'); const pending = [];
  for (let i = 0; i < MAX_SOUND_TRACKS; i++) pending.push(store.stage(file));
  assert.throws(() => store.stage(file));
  for (const choice of pending) store.confirm(choice.id);
  assert.equal(new SoundStore(path.join(directory, 'limits')).settings.tracks.length, MAX_SOUND_TRACKS);
  assert.throws(() => store.stage(file));
  store.remove(pending[0].id); const replacement = store.stage(file); store.discard(replacement.id);
  const large = fixture('large.wav'); fs.truncateSync(large, MAX_SOUND_BYTES + 1);
  assert.throws(() => store.stage(large));
  const folder = path.join(directory, 'total'); fs.mkdirSync(folder);
  const tracks = [];
  for (let size = 0; size < MAX_SOUND_LIBRARY_BYTES; size += MAX_SOUND_BYTES) {
    const id = randomUUID(), file = path.join(folder, `sound-${id}`); fs.writeFileSync(file, ''); fs.truncateSync(file, MAX_SOUND_BYTES);
    tracks.push({ id, name: 'music.wav', mime: 'audio/wav' });
  }
  fs.writeFileSync(path.join(folder, 'sound.json'), JSON.stringify({ version: 2, tracks, selectedId: tracks[0].id }));
  const full = new SoundStore(folder); assert.equal(full.settings.tracks.length, tracks.length);
  assert.throws(() => full.stage(path.join(directory, 'small.wav')), /120/);
}
try {
  legacy(); library(); failedWrites(); protection(); limits();
  console.log('PASS sound library: legacy migration, multi-file staging, random/selected/tone, duration/full/stop-on-move, bounded library, restart/missing assets, detached reads, invalid input and atomic failure preservation.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
