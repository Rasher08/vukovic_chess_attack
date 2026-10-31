import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SoundStore, MAX_SOUND_BYTES } from '../core/soundStore';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-sound-'));
try {
  const store = new SoundStore(path.join(directory, 'settings'));
  assert.equal(store.settings.enabled, false, 'First run stays silent');
  assert.equal(store.read(), null);
  store.configure({ enabled: true, volume: 57, duration: 10 });
  const file = path.join(directory, 'my-phrase.mp3'); fs.writeFileSync(file, Buffer.from('fixture'));
  const choice = store.stage(file);
  assert.equal(store.settings.name, null, 'An unvalidated selection does not replace the active sound');
  assert.throws(() => store.confirm('arbitrary-id'));
  store.confirm(choice.id);
  fs.rmSync(file);
  const restored = new SoundStore(path.join(directory, 'settings'));
  assert.deepEqual(restored.settings, { enabled: true, volume: 57, duration: 10, name: 'my-phrase.mp3', revision: choice.id });
  assert.equal(restored.read()?.dataUrl, choice.dataUrl, 'Managed copy survives removing the source file');
  const unsupported = path.join(directory, 'web-link.txt'); fs.writeFileSync(unsupported, 'https://music.yandex.ru');
  assert.throws(() => restored.stage(unsupported));
  const large = path.join(directory, 'large.wav'); fs.writeFileSync(large, ''); fs.truncateSync(large, MAX_SOUND_BYTES + 1);
  assert.throws(() => restored.stage(large));
  restored.configure({ volume: -1, duration: 999 });
  assert.equal(restored.settings.volume, 57); assert.equal(restored.settings.duration, 10);
  assert.equal(restored.settings.name, 'my-phrase.mp3', 'Rejected files keep the previous sound');
  restored.reset();
  assert.equal(new SoundStore(path.join(directory, 'settings')).read(), null);
  assert.equal(fs.readdirSync(path.join(directory, 'settings')).filter(f => f.startsWith('sound-')).length, 0);
  fs.writeFileSync(path.join(directory, 'settings', 'sound.json'), '{broken');
  assert.equal(new SoundStore(path.join(directory, 'settings')).settings.enabled, false);
  console.log('PASS sound: silent defaults, confirmed import, managed copy, restart, limits, invalid settings and reset.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
