import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisMode } from './detector';
import type { AnalysisSide } from './controller';

const validMode = (value: unknown): value is AnalysisMode => value === 'fast' || value === 'verified';
const validSide = (value: unknown): value is AnalysisSide => value === 'white' || value === 'black' || value === 'both';

/** Keep unknown saved formats recoverable and publish a mode only after saving. */
export class AnalysisSettingsStore {
  private current: AnalysisMode = 'fast';
  private currentSide: AnalysisSide = 'white';
  private writable = true;
  private readonly config: string;

  constructor(directory: string) {
    fs.mkdirSync(directory, { recursive: true });
    this.config = path.join(directory, 'analysis.json');
    let raw: string;
    try { raw = fs.readFileSync(this.config, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.writable = false;
      return;
    }
    try {
      const value = raw.length <= 4096 ? JSON.parse(raw) : null;
      if (!value || typeof value !== 'object' || Array.isArray(value) || ![1, 2].includes(value.version) ||
        !validMode(value.mode) || value.version === 2 && !validSide(value.side)) {
        this.writable = false;
        return;
      }
      this.current = value.mode;
      // Existing mode-only profiles gain the explicit default without guessing
      // a player's color from their board orientation or move history.
      this.currentSide = value.version === 2 ? value.side : 'white';
    } catch { this.writable = false; }
  }

  get mode(): AnalysisMode { return this.current; }
  get side(): AnalysisSide { return this.currentSide; }

  setMode(mode: AnalysisMode): void {
    if (!validMode(mode)) throw Error('Неизвестный режим проверки.');
    this.persist(mode, this.currentSide);
  }

  setSide(side: AnalysisSide): void {
    if (!validSide(side)) throw Error('Неизвестный цвет для проверки.');
    this.persist(this.current, side);
  }

  private persist(mode: AnalysisMode, side: AnalysisSide): void {
    if (!this.writable) throw Error('Настройки проверки имеют неизвестный формат. Сохранённый файл не был заменён.');
    fs.writeFileSync(this.config + '.tmp', JSON.stringify({ version: 2, mode, side }));
    fs.renameSync(this.config + '.tmp', this.config);
    this.current = mode;
    this.currentSide = side;
  }
}
