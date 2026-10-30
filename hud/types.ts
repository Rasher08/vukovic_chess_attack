import type { HudState } from './core/controller';
export type SourceMode = 'direct' | 'screen';
export interface AppState extends HudState {
  mode: SourceMode; sound: boolean; collapsed: boolean; movable: boolean;
  bridge: 'waiting' | 'connected' | 'conflict'; capturePermission: string;
}
export interface HudAPI {
  getState(): Promise<AppState>;
  getToken(): Promise<string>;
  sources(): Promise<{ id: string; name: string; thumbnail: string }[]>;
  selectSource(id: string): Promise<void>;
  screenPosition(fen: string | null): void;
  configure(settings: { mode?: SourceMode; paused?: boolean; sound?: boolean; collapsed?: boolean; movable?: boolean }): Promise<void>;
  openSettings(): void;
  copyToken(): Promise<void>;
  onState(listener: (state: AppState) => void): () => void;
  onSound(listener: () => void): () => void;
  onNewGame(listener: () => void): () => void;
}
declare global { interface Window { hud: HudAPI } }
