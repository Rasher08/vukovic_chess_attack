/**
 * Web Audio API Synthesizer for Vukovic Chess Attack Platform.
 * Provides zero-external-dependency sound effects for chess moves,
 * captures, checks, victory fanfares, and calculation errors.
 * 
 * Fully SSR-safe and handles browser autoplay audio context resumption.
 */

// Global AudioContext singleton
let globalAudioCtx: AudioContext | null = null;
let isAudioMutedState: boolean = false;

/**
 * Безопасно инициализирует или возвращает активный AudioContext.
 * Корректно обрабатывает SSR (window undefined) и политику браузера
 * по блокировке автовоспроизведения до первого взаимодействия пользователя.
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtxClass) {
      return null;
    }

    if (!globalAudioCtx) {
      globalAudioCtx = new AudioCtxClass();
    }

    // Если контекст приостановлен браузером, пробуем его возобновить
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {
        // Игнорируем ошибку, если пользователь еще не совершил жест
      });
    }

    return globalAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Устанавливает статус отключения звука
 * @param muted true, если звук выключен
 */
export function setAudioMuted(muted: boolean): void {
  isAudioMutedState = muted;
}

/**
 * Возвращает текущий статус звука
 */
export function isAudioMuted(): boolean {
  return isAudioMutedState;
}

/**
 * Переключает статус звука (вкл/выкл)
 * @returns новое значение (true если выключен, false если включен)
 */
export function toggleAudio(): boolean {
  isAudioMutedState = !isAudioMutedState;
  return isAudioMutedState;
}

/**
 * Воспроизводит звук обычного тихого хода:
 * Тонкий деревянный щелчок (синусоида 400 Гц, экспоненциальное затухание 60 мс).
 */
export function playMoveSound(): void {
  if (isAudioMutedState) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    // Легкое быстрое падение частоты для имитации деревянного удара
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // Безопасный перехват ошибок Web Audio
  }
}

/**
 * Воспроизводит звук взятия фигуры:
 * Плотный акцентированный перкуссионный удар (260 Гц, 100 мс).
 */
export function playCaptureSound(): void {
  if (isAudioMutedState) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // Безопасный перехват
  }
}

/**
 * Воспроизводит звук шаха королю:
 * Звонкий предупреждающий тон (880 Гц, колокольный отзвук 140 мс).
 */
export function playCheckSound(): void {
  if (isAudioMutedState) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(1760, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    overtone.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 0.14);
    overtone.stop(now + 0.14);
  } catch {
    // Безопасный перехват
  }
}

/**
 * Воспроизводит звук победного решения / завершения этюда:
 * Торжественный восходящий мажорный аккорд/арпеджио C5 - E5 - G5 - C6 (400 мс).
 */
export function playVictorySound(): void {
  if (isAudioMutedState) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 523.25, time: 0.00, dur: 0.35 }, // C5
      { freq: 659.25, time: 0.09, dur: 0.32 }, // E5
      { freq: 783.99, time: 0.18, dur: 0.30 }, // G5
      { freq: 1046.50, time: 0.27, dur: 0.45 }, // C6
    ];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.25, ctx.currentTime);
    masterGain.connect(ctx.destination);

    notes.forEach(({ freq, time, dur }) => {
      if (!ctx) return;
      const startTime = ctx.currentTime + time;
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      noteGain.gain.setValueAtTime(0.001, startTime);
      noteGain.gain.linearRampToValueAtTime(0.3, startTime + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + dur);
    });
  } catch {
    // Безопасный перехват
  }
}

/**
 * Воспроизводит звук ошибки или неточного расчета:
 * Низкий глухой предупреждающий шлепок (150 Гц -> 80 Гц, 150 мс).
 */
export function playErrorSound(): void {
  if (isAudioMutedState) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch {
    // Безопасный перехват
  }
}

/**
 * Экспортируемый фасад синтезатора для вызова через объект или класс
 */
export const audioSynth = {
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playVictorySound,
  playErrorSound,
  // Алиасы для лаконичного вызова
  playMove: playMoveSound,
  playCapture: playCaptureSound,
  playCheck: playCheckSound,
  playVictory: playVictorySound,
  playError: playErrorSound,
  setMuted: setAudioMuted,
  isMuted: isAudioMuted,
  toggleMuted: toggleAudio,
};

export default audioSynth;
