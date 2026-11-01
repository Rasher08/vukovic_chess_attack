import type { SoundAsset, SoundSettings } from '../core/soundStore';
import type { AppState } from '../types';

/** Chromium probes actual media, rather than trusting the file extension. */
export function validateSound(asset: SoundAsset): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const timer = setTimeout(() => finish(Error('Не удалось прочитать аудио. Попробуйте MP3 или WAV.')), 10000);
    const finish = (error?: Error) => {
      clearTimeout(timer); audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute('src'); audio.load();
      if (error) reject(error); else resolve();
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? undefined : Error('У аудио нет доступной длительности.'));
    audio.onerror = () => finish(Error('Этот файл не воспроизводится. Попробуйте MP3 или WAV.'));
    audio.src = asset.dataUrl;
  });
}

type PlaybackState = Pick<AppState, 'mode' | 'status' | 'revision' | 'sound' | 'soundSettings'>;
export function soundSettingsIdentity(settings: SoundSettings): string {
  return JSON.stringify([settings.enabled, settings.volume, settings.duration, settings.stopOnMove,
    settings.selection, settings.selectedId, settings.includeTone, settings.activeIds, settings.revision, settings.tracks.map(track => [track.id, track.name])]);
}

/** A valid new position may keep the music; losing the source never does. */
export function shouldStopSound(previous: PlaybackState | undefined, next: PlaybackState, preview = false): boolean {
  if (!previous) return false;
  if (previous.mode !== next.mode || soundSettingsIdentity(previous.soundSettings) !== soundSettingsIdentity(next.soundSettings)) return true;
  if (preview) {
    // Manual audition works before a board is connected, but an explicit pause,
    // mute or newly unavailable source must still withdraw it immediately.
    return previous.sound && !next.sound || previous.status !== next.status && ['unknown', 'error', 'paused'].includes(next.status);
  }
  if (!next.sound || !['checking', 'checked'].includes(next.status)) return true;
  return next.soundSettings.stopOnMove && previous.revision !== next.revision;
}

export class NotificationSoundPlayer {
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sequence = 0;
  constructor(private onEnded: () => void = () => {}) {}
  get playing() { return !!this.audio && !this.audio.paused || !!this.context && this.context.state === 'running'; }
  stop() {
    ++this.sequence; clearTimeout(this.timer); this.timer = undefined;
    if (this.audio) { this.audio.onended = this.audio.onerror = null; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = null; }
    if (this.context) { void this.context.close(); this.context = null; }
  }
  async play(asset: SoundAsset | null, settings: Pick<SoundSettings, 'volume' | 'duration'>) {
    this.stop(); const sequence = this.sequence;
    if (settings.volume <= 0) return;
    if (asset) {
      const audio = new Audio(asset.dataUrl); this.audio = audio;
      audio.volume = settings.volume / 100; audio.loop = false;
      const ended = () => { if (sequence === this.sequence) { this.stop(); this.onEnded(); } };
      // Set before play(): a very short track can finish before play resolves.
      audio.onended = ended; audio.onerror = ended;
      try { await audio.play(); }
      catch (error) { if (sequence !== this.sequence) return; this.stop(); throw error; }
      if (sequence !== this.sequence) return;
      // Zero means its natural end; shorter files never loop to fill a timer.
      if (settings.duration > 0) this.timer = setTimeout(ended, settings.duration * 1000);
    } else {
      const context = new AudioContext(); this.context = context;
      await context.resume(); if (sequence !== this.sequence) return;
      const tone = context.createOscillator(), gain = context.createGain();
      tone.connect(gain); gain.connect(context.destination); tone.frequency.value = 660;
      gain.gain.setValueAtTime(.08 * settings.volume / 100, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .15);
      tone.onended = () => { if (sequence === this.sequence) { this.stop(); this.onEnded(); } };
      tone.start(); tone.stop(context.currentTime + .16);
    }
  }
}
