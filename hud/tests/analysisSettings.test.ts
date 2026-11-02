import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AnalysisSettingsStore } from '../core/analysisSettings';
import type { AnalysisMode } from '../core/detector';
import type { AnalysisSide } from '../core/controller';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-analysis-settings-'));

function persistence() {
  const folder = path.join(directory, 'normal');
  const store = new AnalysisSettingsStore(folder);
  assert.equal(store.mode, 'fast', 'New profiles start in the fast mode');
  assert.equal(store.side, 'white', 'New profiles explicitly analyze only White');
  const config = path.join(folder, 'analysis.json');
  assert(!fs.existsSync(config), 'Reading defaults does not create an unsolicited settings file');
  store.setMode('verified');
  assert.equal(store.mode, 'verified');
  assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), { version: 2, mode: 'verified', side: 'white' });
  assert.equal(new AnalysisSettingsStore(folder).mode, 'verified', 'The selected mode survives restart');
  store.setSide('black');
  assert.equal(store.mode, 'verified', 'Selecting a side preserves the existing mode');
  assert.equal(new AnalysisSettingsStore(folder).side, 'black', 'The player color survives restart');
  store.setMode('fast');
  assert.equal(new AnalysisSettingsStore(folder).mode, 'fast');
  assert.equal(new AnalysisSettingsStore(folder).side, 'black', 'Selecting a mode preserves the existing side');
  store.setSide('both');
  assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), { version: 2, mode: 'fast', side: 'both' });
  assert.equal(new AnalysisSettingsStore(folder).side, 'both');
  assert(!fs.existsSync(config + '.tmp'), 'A successful atomic rename leaves no pending settings');
  const saved = fs.readFileSync(config, 'utf8');
  for (const value of ['slow', '', null, undefined, 1, true, {}, ['fast']]) {
    assert.throws(() => store.setMode(value as AnalysisMode), /режим/);
    assert.equal(store.mode, 'fast');
    assert.equal(fs.readFileSync(config, 'utf8'), saved, 'Invalid modes cannot change the saved configuration');
  }
  for (const value of ['auto', 'w', '', null, undefined, 1, true, {}, ['white']]) {
    assert.throws(() => store.setSide(value as AnalysisSide), /цвет/);
    assert.equal(store.mode, 'fast'); assert.equal(store.side, 'both');
    assert.equal(fs.readFileSync(config, 'utf8'), saved, 'Invalid player colors cannot change either saved setting');
  }
}

function modeOnlyMigration() {
  for (const mode of ['fast', 'verified'] as const) {
    const folder = path.join(directory, `v1-${mode}`);
    fs.mkdirSync(folder);
    const config = path.join(folder, 'analysis.json');
    const raw = JSON.stringify({ version: 1, mode });
    fs.writeFileSync(config, raw);
    const store = new AnalysisSettingsStore(folder);
    assert.equal(store.mode, mode); assert.equal(store.side, 'white');
    assert.equal(fs.readFileSync(config, 'utf8'), raw, 'Loading an older profile does not rewrite it before a successful save');
    store.setSide('black');
    assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), { version: 2, mode, side: 'black' });
    const restored = new AnalysisSettingsStore(folder);
    assert.equal(restored.mode, mode); assert.equal(restored.side, 'black');
  }
}

function protectedFiles() {
  for (const [name, raw] of [
    ['broken', '{broken'],
    ['future', JSON.stringify({ version: 3, mode: 'verified', side: 'black' })],
    ['invalid-mode', JSON.stringify({ version: 1, mode: 'slow' })],
    ['invalid-side', JSON.stringify({ version: 2, mode: 'verified', side: 'auto' })],
    ['missing-side', JSON.stringify({ version: 2, mode: 'verified' })],
    ['missing-version', JSON.stringify({ mode: 'verified' })],
    ['array', '[]'],
    ['oversized', ' '.repeat(4097)],
  ]) {
    const folder = path.join(directory, name);
    fs.mkdirSync(folder);
    const config = path.join(folder, 'analysis.json');
    fs.writeFileSync(config, raw);
    const store = new AnalysisSettingsStore(folder);
    assert.equal(store.mode, 'fast');
    assert.equal(store.side, 'white');
    assert.throws(() => store.setMode('verified'));
    assert.throws(() => store.setMode('fast'), /формат/, 'Even selecting the default must not replace an unknown file');
    assert.throws(() => store.setSide('black'));
    assert.equal(fs.readFileSync(config, 'utf8'), raw, 'A corrupted or future format remains recoverable');
  }
}

function failedPersistence() {
  const folder = path.join(directory, 'write-failure');
  const store = new AnalysisSettingsStore(folder);
  store.setMode('verified');
  store.setSide('black');
  const config = path.join(folder, 'analysis.json');
  const raw = fs.readFileSync(config, 'utf8');
  fs.mkdirSync(config + '.tmp');
  assert.throws(() => store.setMode('fast'));
  assert.equal(store.mode, 'verified', 'A failed write cannot change the active mode');
  assert.throws(() => store.setSide('both'));
  assert.equal(store.side, 'black', 'A failed write cannot change the active player color');
  assert.equal(fs.readFileSync(config, 'utf8'), raw);
  fs.rmSync(config + '.tmp', { recursive: true });
  store.setMode('fast');
  assert.equal(new AnalysisSettingsStore(folder).mode, 'fast', 'A failed write can be retried');
  assert.equal(new AnalysisSettingsStore(folder).side, 'black');

  store.setMode('verified');
  fs.renameSync(config, config + '.saved');
  fs.mkdirSync(config);
  assert.throws(() => store.setMode('fast'));
  assert.equal(store.mode, 'verified', 'The mode changes only after rename succeeds, not after the temporary write');
  assert.throws(() => store.setSide('both'));
  assert.equal(store.side, 'black', 'The player color also changes only after rename succeeds');
  fs.rmdirSync(config);
  fs.renameSync(config + '.saved', config);
  assert.equal(new AnalysisSettingsStore(folder).mode, 'verified');
  store.setSide('both');
  assert.equal(new AnalysisSettingsStore(folder).side, 'both', 'A failed rename can also be retried');
  assert.equal(new AnalysisSettingsStore(folder).mode, 'verified');
}

try {
  persistence(); modeOnlyMigration(); protectedFiles(); failedPersistence();
  console.log('Analysis settings PASS: fast/White defaults, saved mode and player color, v1 migration, validation, unknown-format preservation and atomic write/rename failures.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
