import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface SoundTrack { id: string; name: string }
export interface SoundSettings {
  enabled: boolean; volume: number; duration: number; stopOnMove: boolean;
  selection: 'selected' | 'random'; selectedId: string | null; tracks: SoundTrack[];
  name: string | null; revision: string;
}
export interface SoundAsset { name: string; dataUrl: string }
export interface SoundChoice extends SoundAsset { id: string }
export interface SoundConfiguration {
  enabled?: boolean; volume?: number; duration?: number; stopOnMove?: boolean;
  selection?: 'selected' | 'random'; selectedId?: string | null;
}
const MIME: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac' };
export const MAX_SOUND_BYTES = 12 * 1024 * 1024;
export const MAX_SOUND_TRACKS = 20;
export const MAX_SOUND_LIBRARY_BYTES = 120 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: false, volume: 35, duration: 5, stopOnMove: true,
  selection: 'selected', selectedId: null, tracks: [], name: null, revision: '',
};
type Track = SoundTrack & { mime: string; size: number };
type Saved = Pick<SoundSettings, 'enabled' | 'volume' | 'duration' | 'stopOnMove' | 'selection' | 'selectedId'> & { version: 2; tracks: Track[] };
const validDuration = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 600;

/** User-picked files are copied into a bounded library only after media validation. */
export class SoundStore {
  private saved: Saved = {
    version: 2, enabled: false, volume: 35, duration: 5, stopOnMove: true,
    selection: 'selected', selectedId: null, tracks: [],
  };
  private pending = new Map<string, Track & { bytes: Buffer }>();
  private cached = new Map<string, SoundAsset>();
  private readonly config: string;
  private writable = true;
  constructor(private directory: string, private options: { random?: () => number } = {}) {
    fs.mkdirSync(directory, { recursive: true });
    this.config = path.join(directory, 'sound.json');
    let raw: string;
    try { raw = fs.readFileSync(this.config, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.writable = false;
      return;
    }
    try {
      if (raw.length > 100_000) { this.writable = false; return; }
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![undefined, 1, 2].includes(value.version) || (value.version === 2 && !Array.isArray(value.tracks)) ||
        (value.version !== 2 && Object.prototype.hasOwnProperty.call(value, 'tracks'))) {
        this.writable = false; return;
      }
      this.saved.enabled = value.enabled === true;
      if (Number.isInteger(value.volume) && value.volume >= 0 && value.volume <= 100) this.saved.volume = value.volume;
      if (validDuration(value.duration)) this.saved.duration = value.duration;
      if (typeof value.stopOnMove === 'boolean') this.saved.stopOnMove = value.stopOnMove;
      if (value.selection === 'random') this.saved.selection = 'random';
      const candidates: unknown[] = value.version === 2 ? value.tracks : value.asset ? [value.asset] : [];
      let total = 0;
      for (const candidate of candidates) {
        if (this.saved.tracks.length >= MAX_SOUND_TRACKS) break;
        const a = candidate as Partial<Track> | null;
        if (!a || !UUID.test(a.id || '') || typeof a.name !== 'string' || !a.name || !Object.values(MIME).includes(a.mime || '') || this.saved.tracks.some(track => track.id === a.id)) continue;
        try {
          const stat = fs.statSync(this.assetPath(a.id!));
          if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SOUND_BYTES || total + stat.size > MAX_SOUND_LIBRARY_BYTES) continue;
          this.saved.tracks.push({ id: a.id!, name: a.name.slice(0, 180), mime: a.mime!, size: stat.size }); total += stat.size;
        } catch { /* One missing track must not discard the rest of the library. */ }
      }
      const selected = value.version === 2 ? value.selectedId : value.asset?.id;
      this.saved.selectedId = this.saved.tracks.some(track => track.id === selected) ? selected : null;
      // Keep the surviving library useful when the previously selected file disappeared.
      if (selected && this.saved.selectedId === null) this.saved.selectedId = this.saved.tracks[0]?.id ?? null;
      if (!this.saved.tracks.length) this.saved.selection = 'selected';
    } catch { this.writable = false; }
  }
  get settings(): SoundSettings {
    const { enabled, volume, duration, stopOnMove, selection, selectedId, tracks } = this.saved;
    return { enabled, volume, duration, stopOnMove, selection, selectedId,
      tracks: tracks.map(({ id, name }) => ({ id, name })), name: tracks.find(track => track.id === selectedId)?.name ?? null,
      revision: tracks.length ? `${selection}:${selectedId ?? ''}:${tracks.map(track => track.id).join(',')}` : '' };
  }
  configure(value: SoundConfiguration) {
    const next = { ...this.saved };
    if (typeof value.enabled === 'boolean') next.enabled = value.enabled;
    if (Number.isInteger(value.volume) && value.volume! >= 0 && value.volume! <= 100) next.volume = value.volume!;
    if (validDuration(value.duration)) next.duration = value.duration;
    if (typeof value.stopOnMove === 'boolean') next.stopOnMove = value.stopOnMove;
    if (value.selectedId !== undefined) {
      if (value.selectedId !== null && !this.saved.tracks.some(track => track.id === value.selectedId)) throw Error('Этот трек не найден в библиотеке.');
      next.selectedId = value.selectedId!; next.selection = 'selected';
    }
    if (value.selection === 'selected' || value.selection === 'random') next.selection = value.selection;
    this.persist(next);
  }
  stage(file: string): SoundChoice {
    this.assertWritable();
    if (this.saved.tracks.length + this.pending.size >= MAX_SOUND_TRACKS) throw Error(`В библиотеке может быть до ${MAX_SOUND_TRACKS} треков. Удалите ненужный трек.`);
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) throw Error('Выберите MP3, WAV, OGG, M4A, AAC или FLAC.');
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SOUND_BYTES) throw Error('Нужен аудиофайл размером до 12 МБ.');
    const bytes = fs.readFileSync(file);
    if (!bytes.length || bytes.length > MAX_SOUND_BYTES) throw Error('Нужен аудиофайл размером до 12 МБ.');
    const total = this.saved.tracks.reduce((sum, a) => sum + a.size, 0) + Array.from(this.pending.values()).reduce((sum, a) => sum + a.size, 0);
    if (total + bytes.length > MAX_SOUND_LIBRARY_BYTES) throw Error('Библиотека аудио ограничена 120 МБ.');
    const id = randomUUID(), name = path.basename(file).slice(0, 180);
    this.pending.set(id, { id, name, mime, size: bytes.length, bytes });
    return { id, name, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  }
  // Each staged file must be successfully decoded by Chromium before confirming.
  confirm(id: string) {
    this.assertWritable();
    const candidate = this.pending.get(id);
    if (!candidate) throw Error('Выберите аудиофайл заново.');
    if (this.saved.tracks.length >= MAX_SOUND_TRACKS || this.saved.tracks.reduce((sum, a) => sum + a.size, 0) + candidate.size > MAX_SOUND_LIBRARY_BYTES) throw Error('Лимит библиотеки аудио исчерпан.');
    const file = this.assetPath(id); let created = false; let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(file, 'wx'); created = true;
      fs.writeFileSync(descriptor, candidate.bytes); fs.closeSync(descriptor); descriptor = undefined;
      const { bytes: _bytes, ...track } = candidate;
      this.persist({ ...this.saved, tracks: [...this.saved.tracks, track], selectedId: id, selection: 'selected' });
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (created) this.cleanup(file);
      throw error;
    }
    this.pending.delete(id);
    this.cache(id, { name: candidate.name, dataUrl: `data:${candidate.mime};base64,${candidate.bytes.toString('base64')}` });
  }
  /** Discard failed media probes without retaining their bytes in memory. */
  discard(id: string) { this.pending.delete(id); }
  reset() {
    this.persist({ ...this.saved, selection: 'selected', selectedId: null });
    this.pending.clear();
  }
  remove(id: string) {
    const previous = this.saved.tracks.find(track => track.id === id);
    if (!previous) throw Error('Этот трек не найден в библиотеке.');
    const tracks = this.saved.tracks.filter(track => track.id !== id);
    const selectedId = this.saved.selectedId === id ? tracks[0]?.id ?? null : this.saved.selectedId;
    this.persist({ ...this.saved, tracks, selectedId, selection: tracks.length ? this.saved.selection : 'selected' });
    this.pending.delete(id); this.cached.delete(id); this.cleanup(this.assetPath(id));
  }
  read(id?: string): SoundAsset | null {
    let selected = id;
    if (selected === undefined) {
      if (this.saved.selection === 'random' && this.saved.tracks.length) {
        const random = (this.options.random || Math.random)();
        if (!Number.isFinite(random) || random < 0 || random >= 1) throw Error('Не удалось выбрать случайный трек.');
        selected = this.saved.tracks[Math.floor(random * this.saved.tracks.length)].id;
      } else selected = this.saved.selectedId ?? undefined;
    }
    if (selected === undefined) return null;
    const a = this.saved.tracks.find(track => track.id === selected);
    if (!a) throw Error('Этот трек не найден в библиотеке.');
    const cached = this.cached.get(selected);
    if (cached) return { ...cached };
    const file = this.assetPath(a.id), stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SOUND_BYTES) throw Error('Аудиофайл недоступен. Добавьте его заново.');
    const bytes = fs.readFileSync(file);
    if (!bytes.length || bytes.length > MAX_SOUND_BYTES) throw Error('Аудиофайл недоступен. Добавьте его заново.');
    const asset = { name: a.name, dataUrl: `data:${a.mime};base64,${bytes.toString('base64')}` };
    this.cache(selected, asset); return { ...asset };
  }
  private assetPath(id: string) { return path.join(this.directory, `sound-${id}`); }
  private cache(id: string, asset: SoundAsset) {
    if (!this.cached.has(id) && this.cached.size >= 2) this.cached.delete(this.cached.keys().next().value!);
    this.cached.set(id, asset);
  }
  private cleanup(file: string) { try { fs.rmSync(file, { force: true }); } catch { /* The config is authoritative; an orphan is safer than losing the selection. */ } }
  private assertWritable() { if (!this.writable) throw Error('Сохранённая библиотека имеет неизвестный формат. Она не была заменена.'); }
  private persist(value: Saved) {
    this.assertWritable();
    fs.writeFileSync(this.config + '.tmp', JSON.stringify(value));
    fs.renameSync(this.config + '.tmp', this.config); this.saved = value;
  }
}
