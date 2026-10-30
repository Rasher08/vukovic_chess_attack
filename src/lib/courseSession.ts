import { Chess } from 'chess.js';

export type LineAssessment =
  | { kind: 'correct'; matchedPlies: number; extraPlies: number }
  | { kind: 'incomplete'; matchedPlies: number; remainingPlies: number }
  | { kind: 'divergence'; matchedPlies: number; divergencePly: number }
  | { kind: 'invalid'; source: 'input' | 'reference'; invalidPly: number };

/** Accept a plain SAN line with optional move numbers, comments and PGN result. */
export function tokenizeSan(text: string): string[] {
  return text.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ').replace(/\$\d+/g, ' ')
    .replace(/…/g, '...').replace(/\d+\.(?:\.\.)?/g, ' ')
    .split(/\s+/).map((token) => token.trim()).filter((token) => token && !['1-0', '0-1', '1/2-1/2', '*', '...'].includes(token));
}

/** Parse with chess.js so SAN aliases do not affect comparison. Never evaluates a move. */
export function canonicalizeLine(initialFen: string, line: string[]): { san: string[]; fens: string[]; invalidPly?: number } {
  let game: Chess;
  try { game = new Chess(initialFen); } catch { return { san: [], fens: [], invalidPly: 0 }; }
  const san: string[] = [];
  const fens = [game.fen()];
  for (let index = 0; index < line.length; index += 1) {
    try {
      const move = game.move(line[index]);
      san.push(move.san);
      fens.push(game.fen());
    } catch { return { san, fens, invalidPly: index + 1 }; }
  }
  return { san, fens };
}

/** A deviation means only that the recorded line does not cover it, never that it loses. */
export function assessCourseLine(initialFen: string, input: string[], reference: string[]): LineAssessment {
  const candidate = canonicalizeLine(initialFen, input);
  if (candidate.invalidPly !== undefined) return { kind: 'invalid', source: 'input', invalidPly: candidate.invalidPly };
  const expected = canonicalizeLine(initialFen, reference);
  if (expected.invalidPly !== undefined || !expected.san.length) return { kind: 'invalid', source: 'reference', invalidPly: expected.invalidPly ?? 0 };
  let matchedPlies = 0;
  while (matchedPlies < Math.min(candidate.san.length, expected.san.length) && candidate.san[matchedPlies] === expected.san[matchedPlies]) matchedPlies += 1;
  if (matchedPlies === expected.san.length) return { kind: 'correct', matchedPlies, extraPlies: candidate.san.length - expected.san.length };
  if (matchedPlies === candidate.san.length) return { kind: 'incomplete', matchedPlies, remainingPlies: expected.san.length - matchedPlies };
  return { kind: 'divergence', matchedPlies, divergencePly: matchedPlies + 1 };
}

/** Prefer any completed accepted branch, otherwise the longest matching prefix. */
export function assessCourseLines(initialFen: string, input: string[], references: string[][]): LineAssessment {
  const results = references.map((reference) => assessCourseLine(initialFen, input, reference));
  const inputError = results.find((result) => result.kind === 'invalid' && result.source === 'input');
  if (inputError) return inputError;
  const correct = results.find((result) => result.kind === 'correct');
  if (correct) return correct;
  const incomplete = results.filter((result) => result.kind === 'incomplete').sort((a, b) => (b.kind === 'incomplete' ? b.matchedPlies : 0) - (a.kind === 'incomplete' ? a.matchedPlies : 0))[0];
  if (incomplete) return incomplete;
  const divergence = results.filter((result) => result.kind === 'divergence').sort((a, b) => (b.kind === 'divergence' ? b.matchedPlies : 0) - (a.kind === 'divergence' ? a.matchedPlies : 0))[0];
  return divergence || results[0] || { kind: 'invalid', source: 'reference', invalidPly: 0 };
}
