import { Chess } from 'chess.js';

export interface EngineLineStep {
  /** One-based index within the suggested line, unrelated to the game's ply. */
  index: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  color: 'w' | 'b';
  moveNumber: number;
}

export interface EngineLineResult {
  steps: EngineLineStep[];
  error: string | null;
}

/** Replay the engine's SAN from its search root, never from the played move's result. */
export function buildEngineLine(fenBefore: string, sans: readonly string[]): EngineLineResult {
  const steps: EngineLineStep[] = [];
  if (typeof fenBefore !== 'string' || !fenBefore.trim()) {
    return { steps, error: 'Не удалось открыть исходную позицию линии движка.' };
  }
  let board: Chess;
  try { board = new Chess(fenBefore); }
  catch { return { steps, error: 'Не удалось открыть исходную позицию линии движка.' }; }
  if (!Array.isArray(sans)) return { steps, error: 'Не удалось прочитать ходы линии движка.' };

  // The review stores at most twelve PV plies. Do not expand a restored or
  // caller-supplied line beyond that review budget, or mutate its original array.
  for (const raw of sans.slice(0, 12)) {
    const index = steps.length + 1;
    const before = board.fen();
    const color = board.turn();
    const moveNumber = Number(before.split(' ')[5]);
    if (typeof raw !== 'string' || !raw.trim()) {
      return { steps, error: `Не удалось прочитать ход ${index} в линии движка.` };
    }
    try {
      const move = board.move(raw.trim(), { strict: true });
      steps.push({
        index, san: move.san, uci: `${move.from}${move.to}${move.promotion || ''}`,
        fenBefore: before, fenAfter: board.fen(), color, moveNumber,
      });
    } catch {
      return { steps, error: `Ход ${index} в линии движка не подходит к этой позиции. Доступна проверенная часть линии.` };
    }
  }
  return { steps, error: null };
}
