import type { RushResult } from './core/engine';
export type RushStatus = 'warming' | 'waiting' | 'searching' | 'ready' | 'paused' | 'error';
export interface RushState {
  status: RushStatus;
  fen: string | null;
  result: RushResult | null;
  revision: number;
  cached: boolean;
  error: string | null;
}
export interface AppState extends RushState {
  budget: number;
  connected: boolean;
  version: string;
  engineLabel: string;
}
export interface RushAPI {
  state(): Promise<AppState>;
  configure(value: { budget?: number; paused?: boolean }): Promise<void>;
  copyToken(): Promise<void>;
  token(): Promise<string>;
  openExtension(): Promise<void>;
  analyze(fen: string): Promise<void>;
  onState(listener: (state: AppState) => void): () => void;
}
