/**
 * Web Audio API Synthesizer Harness.
 * Intercepts and validates zero-dependency sound generation for
 * moves (400 Hz), captures (260 Hz), checks (880 Hz), and victory fanfare (C-E-G-C).
 */

export type AudioSoundType = 'move' | 'capture' | 'check' | 'victory';

export interface AudioPlaybackEvent {
  type: AudioSoundType;
  frequencies: number[];
  durationMs: number;
  timestamp: number;
}

export class SynthHarness {
  public events: AudioPlaybackEvent[] = [];
  public isAudioMuted: boolean = false;

  playMove(): void {
    if (this.isAudioMuted) return;
    this.events.push({
      type: 'move',
      frequencies: [400],
      durationMs: 60,
      timestamp: Date.now(),
    });
  }

  playCapture(): void {
    if (this.isAudioMuted) return;
    this.events.push({
      type: 'capture',
      frequencies: [260],
      durationMs: 100,
      timestamp: Date.now(),
    });
  }

  playCheck(): void {
    if (this.isAudioMuted) return;
    this.events.push({
      type: 'check',
      frequencies: [880],
      durationMs: 140,
      timestamp: Date.now(),
    });
  }

  playVictory(): void {
    if (this.isAudioMuted) return;
    // C5, E5, G5, C6 major arpeggio
    this.events.push({
      type: 'victory',
      frequencies: [523.25, 659.25, 783.99, 1046.5],
      durationMs: 400,
      timestamp: Date.now(),
    });
  }

  hasPlayed(type: AudioSoundType): boolean {
    return this.events.some((e) => e.type === type);
  }

  getCount(type: AudioSoundType): number {
    return this.events.filter((e) => e.type === type).length;
  }

  getLastEvent(): AudioPlaybackEvent | null {
    return this.events[this.events.length - 1] ?? null;
  }

  clear(): void {
    this.events = [];
  }
}
