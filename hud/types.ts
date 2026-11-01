import type { HudState } from './core/controller';
import type { ScreenIssue } from './core/screenStatus';
import type { MoveIssue } from './core/moveHistory';
import type { SoundSettings, SoundAsset, SoundChoice } from './core/soundStore';
export type SourceMode = 'direct' | 'screen' | 'moves';
export interface AppState extends HudState {
  version: string;
  mode: SourceMode; sound: boolean; collapsed: boolean; movable: boolean;
  soundSettings: SoundSettings;
  bridge: 'waiting' | 'connected' | 'conflict'; capturePermission: string;
  screenIssue: ScreenIssue | null;
  moveIssue: MoveIssue; movesCount: number;
}
export interface HudAPI {
  getState(): Promise<AppState>;
  getToken(): Promise<string>;
  sources(): Promise<{ id: string; name: string; thumbnail: string }[]>;
  selectSource(id: string): Promise<void>;
  screenPosition(fen: string | null, issue?: ScreenIssue): void;
  configure(settings: { mode?: SourceMode; paused?: boolean; sound?: boolean; volume?: number; duration?: number; stopOnMove?: boolean; selection?: 'selected' | 'random'; selectedId?: string | null; activeIds?: string[]; includeTone?: boolean; collapsed?: boolean; movable?: boolean }): Promise<void>;
  chooseSound(): Promise<SoundChoice | null>;
  chooseSounds(): Promise<SoundChoice[]>;
  confirmSound(id: string): Promise<void>;
  discardSound(id: string): Promise<void>;
  removeSound(id: string): Promise<void>;
  resetSound(): Promise<void>;
  readSound(id?: string): Promise<SoundAsset | null>;
  openSettings(): void;
  copyToken(): Promise<void>;
  copyDiagnostics(): Promise<void>;
  openExtension(): Promise<void>;
  onState(listener: (state: AppState) => void): () => void;
  onSound(listener: () => void): () => void;
  onNewGame(listener: () => void): () => void;
}
declare global { interface Window { hud: HudAPI } }
