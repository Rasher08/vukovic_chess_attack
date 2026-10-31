import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface SoundSettings { enabled: boolean; volume: number; duration: number; name: string | null; revision: string }
export interface SoundAsset { name: string; dataUrl: string }
export interface SoundChoice extends SoundAsset { id: string }
const MIME: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac' };
export const MAX_SOUND_BYTES = 12 * 1024 * 1024;
const DEFAULTS: SoundSettings = { enabled: false, volume: 35, duration: 5, name: null, revision: '' };
type Saved = { enabled: boolean; volume: number; duration: number; asset?: { id: string; name: string; mime: string } };

/** Only files explicitly chosen by the user can become the one managed sound. */
export class SoundStore {
  private saved: Saved = { ...DEFAULTS };
  private pending?: { id: string; name: string; mime: string; bytes: Buffer };
  private cached: SoundAsset | null | undefined;
  private readonly config: string;
  constructor(private directory: string) {
    fs.mkdirSync(directory, { recursive: true });
    this.config = path.join(directory, 'sound.json');
    try {
      const value = JSON.parse(fs.readFileSync(this.config, 'utf8'));
      this.saved.enabled = value.enabled === true;
      if (Number.isInteger(value.volume) && value.volume >= 0 && value.volume <= 100) this.saved.volume = value.volume;
      if ([3, 5, 10, 20, 30].includes(value.duration)) this.saved.duration = value.duration;
      const a = value.asset;
      if (a && /^[a-f0-9-]{36}$/.test(a.id) && typeof a.name === 'string' && Object.values(MIME).includes(a.mime)) {
        const size = fs.statSync(this.assetPath(a.id)).size;
        if (size > 0 && size <= MAX_SOUND_BYTES) this.saved.asset = { id: a.id, name: a.name.slice(0, 180), mime: a.mime };
      }
    } catch { /* first run or missing custom file: use the built-in tone */ }
  }
  get settings(): SoundSettings {
    return { enabled: this.saved.enabled, volume: this.saved.volume, duration: this.saved.duration,
      name: this.saved.asset?.name ?? null, revision: this.saved.asset?.id ?? '' };
  }
  configure(value: { enabled?: boolean; volume?: number; duration?: number }) {
    const next = { ...this.saved };
    if (typeof value.enabled === 'boolean') next.enabled = value.enabled;
    if (Number.isInteger(value.volume) && value.volume! >= 0 && value.volume! <= 100) next.volume = value.volume!;
    if ([3, 5, 10, 20, 30].includes(value.duration!)) next.duration = value.duration!;
    this.persist(next);
  }
  stage(file: string): SoundChoice {
    this.pending = undefined;
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) throw Error('Выберите MP3, WAV, OGG, M4A, AAC или FLAC.');
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SOUND_BYTES) throw Error('Нужен аудиофайл размером до 12 МБ.');
    const bytes = fs.readFileSync(file);
    if (!bytes.length || bytes.length > MAX_SOUND_BYTES) throw Error('Нужен аудиофайл размером до 12 МБ.');
    const id = randomUUID(), name = path.basename(file).slice(0, 180);
    this.pending = { id, name, mime, bytes };
    return { id, name, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  }
  // The renderer must successfully probe the selected file before confirming.
  confirm(id: string) {
    const candidate = this.pending;
    if (!candidate || candidate.id !== id) throw Error('Выберите аудиофайл заново.');
    const previous = this.saved.asset;
    const file = this.assetPath(id);
    fs.writeFileSync(file, candidate.bytes, { flag: 'wx' });
    try { this.persist({ ...this.saved, asset: { id, name: candidate.name, mime: candidate.mime } }); }
    catch (error) { fs.rmSync(file, { force: true }); throw error; }
    this.cached = { name: candidate.name, dataUrl: `data:${candidate.mime};base64,${candidate.bytes.toString('base64')}` };
    this.pending = undefined;
    if (previous) fs.rmSync(this.assetPath(previous.id), { force: true });
  }
  reset() {
    const previous = this.saved.asset;
    const next = { ...this.saved }; delete next.asset; this.persist(next);
    this.pending = undefined; this.cached = null;
    if (previous) fs.rmSync(this.assetPath(previous.id), { force: true });
  }
  read(): SoundAsset | null {
    if (!this.saved.asset) return null;
    if (this.cached !== undefined) return this.cached;
    const a = this.saved.asset, bytes = fs.readFileSync(this.assetPath(a.id));
    if (!bytes.length || bytes.length > MAX_SOUND_BYTES) throw Error('Аудиофайл недоступен. Выберите его заново.');
    return this.cached = { name: a.name, dataUrl: `data:${a.mime};base64,${bytes.toString('base64')}` };
  }
  private assetPath(id: string) { return path.join(this.directory, `sound-${id}`); }
  private persist(value: Saved) {
    fs.writeFileSync(this.config + '.tmp', JSON.stringify(value));
    fs.renameSync(this.config + '.tmp', this.config);
    this.saved = value;
  }
}
