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
  assert.deepEqual(store.settings.activeIds, [id]); assert.equal(store.settings.includeTone, false);
  assert.equal(store.read()?.dataUrl, `data:audio/mpeg;base64,${content.toString('base64')}`);
  assert.equal(fs.readFileSync(path.join(folder, 'sound.json'), 'utf8'), raw, 'Reading legacy settings does not eagerly rewrite user files');
  store.configure({ duration: 0, stopOnMove: false });
  const migrated = JSON.parse(fs.readFileSync(path.join(folder, 'sound.json'), 'utf8'));
  assert.equal(migrated.version, 3); assert.equal(migrated.asset, undefined); assert.equal(migrated.tracks[0].id, id);
  const restored = new SoundStore(folder);
  assert.deepEqual(restored.settings, store.settings, 'Duration, stop condition and original track survive migration and restart');
  restored.reset();
  assert.equal(restored.read(), null); assert.equal(restored.settings.tracks.length, 1, 'Standard tone does not erase the music library');
  assert(fs.existsSync(path.join(folder, `sound-${id}`)));
  restored.configure({ selection: 'random' }); assert.equal(restored.read()?.name, 'my-phrase.mp3', 'Random uses uploaded music even after switching to standard tone');
  restored.remove(id); assert.equal(restored.settings.tracks.length, 0); assert.throws(() => restored.read(), /Не выбран/);
  assert(!fs.existsSync(path.join(folder, `sound-${id}`)));
}
function library() {
  const folder = path.join(directory, 'library');
  const randoms = [0, 0.999999, 0.5];
  const store = new SoundStore(folder, { random: () => randoms.shift()! });
  assert.equal(store.settings.enabled, false); assert.equal(store.settings.duration, 5); assert.equal(store.settings.stopOnMove, true);
  assert.equal(store.read(), null); assert.deepEqual(store.settings.activeIds, []); assert.equal(store.settings.includeTone, true);
  const a = store.stage(fixture('first.mp3')), b = store.stage(fixture('second.wav'));
  assert.equal(store.settings.tracks.length, 0, 'Unvalidated choices do not change the library');
  assert.throws(() => store.confirm('arbitrary-id'));
  assert.throws(() => store.stage(fixture('web-link.txt', 'https://music.example')));
  store.confirm(a.id); store.confirm(b.id);
  const c = store.stage(fixture('third.ogg')); store.confirm(c.id);
  assert.equal(store.settings.tracks.length, 3); assert.equal(store.settings.name, c.name);
  assert.deepEqual(store.settings.activeIds, [a.id, b.id, c.id]); assert.equal(store.settings.includeTone, false);
  assert.equal(store.settings.selection, 'random', 'Import checks each track and never includes the standard tone by accident');
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
  detached.activeIds.length = 0; assert.equal(store.settings.activeIds.length, 3, 'Playlist metadata is detached from saved state');
  const asset = store.read(a.id)!; asset.name = 'changed'; assert.equal(store.read(a.id)?.name, a.name);
  store.configure({ selectedId: b.id }); assert.equal(store.settings.selection, 'selected');
  store.remove(b.id); assert.equal(store.settings.selectedId, null); assert.equal(store.settings.tracks.length, 2);
  assert.deepEqual(store.settings.activeIds, []); assert.equal(store.settings.includeTone, false);
  assert.throws(() => store.read(), /Не выбран/, 'Removing the only checked track never enables an unchecked track or tone');
  store.configure({ selectedId: a.id });
  const restored = new SoundStore(folder);
  assert.deepEqual(restored.settings, store.settings);
  assert.equal(restored.read(c.id)?.dataUrl, c.dataUrl);
  fs.rmSync(path.join(folder, `sound-${a.id}`));
  const missing = new SoundStore(folder);
  assert.deepEqual(missing.settings.tracks, [{ id: c.id, name: c.name }]);
  assert.equal(missing.settings.selectedId, null, 'A missing selected asset does not enable an unchecked surviving track');
  assert.deepEqual(missing.settings.activeIds, []); assert.equal(missing.settings.includeTone, false);
  assert.throws(() => missing.read(), /Не выбран/); assert.equal(missing.read(c.id)?.name, c.name);
  const failed = missing.stage(fixture('invalid-media.mp3')); missing.discard(failed.id);
  assert.throws(() => missing.confirm(failed.id), 'Failed media validation discards its staged bytes');
}
function playlist() {
  const randoms = [0, 0.99999, 0.5, 0.99999];
  const store = new SoundStore(path.join(directory, 'playlist'), { random: () => randoms.shift()! });
  const choices = ['playlist-a.mp3', 'playlist-b.mp3', 'playlist-c.mp3'].map(name => store.stage(fixture(name)));
  for (const choice of choices) store.confirm(choice.id);
  const [a, b, c] = choices;
  store.configure({ activeIds: [b.id, c.id, b.id], includeTone: false });
  assert.deepEqual(store.settings.activeIds, [b.id, c.id]); assert.equal(store.settings.selectedId, b.id);
  assert.equal(store.settings.selection, 'random');
  assert.deepEqual([store.read()?.name, store.read()?.name], [b.name, c.name], 'Random only samples checked tracks, including the last checked track');
  assert.equal(store.read(a.id)?.name, a.name, 'Explicit preview may read an unchecked track');
  store.configure({ activeIds: [b.id], includeTone: true });
  assert.equal(store.settings.selection, 'random');
  assert.equal(store.read(), null, 'The tone is a genuine random candidate only when its checkbox is checked');
  assert.equal(store.read(), null);
  store.configure({ activeIds: [b.id], includeTone: false });
  assert.equal(store.read()?.name, b.name, 'A single selected file does not consume randomness or fall back to tone');
  const before = store.settings;
  assert.throws(() => store.configure({ activeIds: [b.id, 'missing'], includeTone: true, volume: 90 }));
  assert.deepEqual(store.settings, before, 'Unknown playlist IDs reject all settings changes atomically');
  assert.throws(() => store.configure({ activeIds: 'invalid' as unknown as string[] }));
  assert.deepEqual(store.settings, before);
  store.configure({ activeIds: [], includeTone: false });
  assert.equal(store.settings.selection, 'selected'); assert.equal(store.settings.selectedId, null);
  assert.throws(() => store.read(), /Не выбран/, 'Empty selection is distinct from standard tone');
  assert.deepEqual(new SoundStore(path.join(directory, 'playlist')).settings, store.settings, 'An intentionally empty selection survives restart');
  store.reset(); assert.deepEqual(store.settings.activeIds, []); assert.equal(store.settings.includeTone, true); assert.equal(store.read(), null);
  const d = store.stage(fixture('playlist-d.mp3')); store.confirm(d.id);
  assert.deepEqual(store.settings.activeIds, [d.id]); assert.equal(store.settings.includeTone, false, 'Import replaces tone-only selection even when old unchecked files remain');
  store.configure({ includeTone: true });
  const e = store.stage(fixture('playlist-e.mp3')); store.confirm(e.id);
  assert.deepEqual(store.settings.activeIds, [d.id, e.id]); assert.equal(store.settings.includeTone, true, 'Import preserves an explicitly mixed playlist');
  store.remove(d.id); assert.deepEqual(store.settings.activeIds, [e.id]); assert.equal(store.settings.includeTone, true);
  store.configure({ includeTone: false }); store.remove(e.id);
  assert.deepEqual(store.settings.activeIds, []); assert.equal(store.settings.includeTone, false); assert.throws(() => store.read(), /Не выбран/);
}
function v2Migration() {
  for (const mode of ['random', 'selected', 'tone', 'missing'] as const) {
    const folder = path.join(directory, `v2-${mode}`); fs.mkdirSync(folder);
    const tracks = ['a', 'b'].map(name => {
      const id = randomUUID(); fs.writeFileSync(path.join(folder, `sound-${id}`), name);
      return { id, name: `${name}.mp3`, mime: 'audio/mpeg' };
    });
    const selectedId = mode === 'tone' ? null : mode === 'missing' ? randomUUID() : tracks[1].id;
    const raw = JSON.stringify({ version: 2, tracks, selectedId, selection: mode === 'random' ? 'random' : 'selected', enabled: true, duration: 0 });
    fs.writeFileSync(path.join(folder, 'sound.json'), raw);
    const store = new SoundStore(folder);
    assert.deepEqual(store.settings.activeIds, mode === 'random' ? tracks.map(track => track.id) : mode === 'selected' ? [tracks[1].id] : []);
    assert.equal(store.settings.includeTone, mode === 'tone');
    assert.equal(fs.readFileSync(path.join(folder, 'sound.json'), 'utf8'), raw);
    if (mode === 'missing') assert.throws(() => store.read(), /Не выбран/);
    if (mode === 'selected') assert.equal(store.read()?.name, tracks[1].name);
    if (mode === 'tone') assert.equal(store.read(), null);
    store.configure({ volume: 50 });
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'sound.json'), 'utf8')).version, 3);
    assert.deepEqual(new SoundStore(folder).settings, store.settings);
  }
}
function threeOfTen() {
  const folder = path.join(directory, 'three-of-ten');
  const store = new SoundStore(folder);
  const choices = Array.from({ length: 10 }, (_, index) => store.stage(fixture(`ten-${index}.mp3`)));
  for (const choice of choices) store.confirm(choice.id);
  const selected = [choices[1], choices[5], choices[8]];
  store.configure({ activeIds: selected.map(track => track.id), includeTone: false });
  const samples = [0, 0.01, 0.32, 0.3334, 0.5, 0.6666, 0.6667, 0.999999];
  const restored = new SoundStore(folder, { random: () => samples.shift()! });
  const played = Array.from({ length: samples.length }, () => restored.read()?.name);
  assert.deepEqual(played, [selected[0].name, selected[0].name, selected[0].name, selected[1].name, selected[1].name, selected[1].name, selected[2].name, selected[2].name]);
  assert(played.every(name => selected.some(track => track.name === name)), 'Exactly the three checked files out of ten may play; unchecked files and the unchecked tone never do');
  assert.equal(restored.settings.tracks.length, 10); assert.equal(restored.settings.activeIds.length, 3); assert.equal(restored.settings.includeTone, false);
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
  for (const [name, raw] of [['future', JSON.stringify({ version: 99, tracks: [] })], ['broken', '{broken'], ['invalid', JSON.stringify({ version: 2, tracks: 'not-an-array' })], ['invalid-v3', JSON.stringify({ version: 3, tracks: [], activeIds: 'not-an-array', includeTone: false })]]) {
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
  legacy(); library(); playlist(); v2Migration(); threeOfTen(); failedWrites(); protection(); limits();
  console.log('PASS sound library: v3 checkbox playlist, v2/legacy migration, checked-only random, optional tone, empty/missing selections without fallback, import/remove/reset, duration/full/stop-on-move, limits and atomic failure preservation.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
