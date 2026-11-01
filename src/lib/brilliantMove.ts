import { Chess, type Color, type PieceSymbol } from 'chess.js';
import type { EngineLike, EngineResult } from './autoTraining';

const VALUES: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const NAMES: Record<PieceSymbol, string> = { p: 'пешки', n: 'коня', b: 'слона', r: 'ладьи', q: 'ферзя', k: 'короля' };
const MIN_INVESTMENT_CP = 200;
const MIN_VERIFICATION_DEPTH = 12;
const MIN_VERIFICATION_NODES = 600_000;
const CLEAR_WIN_CP = 300;
// A second positive evaluation alone does not make the sacrifice dispensable.
// Require a full pawn of separation, stable at twice the verification budget.
const MEANINGFUL_GAP_CP = 100;
const MAX_MATE_PROOF_NODES = 4096;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export interface SacrificeAcceptance {
  uci: string;
  san: string;
  fenAfterAcceptance: string;
  /** Material still surrendered after the best immediate legal recapture. */
  investmentCp: number;
}

export interface SacrificeCandidate {
  fenBefore: string;
  fenAfterMove: string;
  uci: string;
  san: string;
  piece: PieceSymbol;
  learner: Color;
  acceptances: SacrificeAcceptance[];
}

function material(game: Chess, learner: Color): number {
  return game.board().flat().reduce((sum, piece) => !piece ? sum : sum + (piece.color === learner ? 1 : -1) * VALUES[piece.type], 0);
}

function play(game: Chess, uci: string) {
  return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

function legalUci(game: Chess): string[] {
  return game.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion || ''}`);
}

/**
 * An original, deliberately conservative Nonchalant heuristic, not a claim to
 * reproduce Chess.com's proprietary labels or to recognize every fine move.
 * A legal offer of a non-pawn piece must cost at least two pawns even after an
 * immediate recapture. Normal exchanges, recaptures and defended pseudo-offers
 * therefore do not qualify. More than four acceptance branches are left unlabelled.
 */
export function inspectSacrifice(fenBefore: string, uci: string): SacrificeCandidate | null {
  return inspectMaterialOffer(fenBefore, uci, MIN_INVESTMENT_CP, false);
}

/** Tal HUD includes pawn and exchange offers; equal trades still invest zero. */
export function inspectSoundSacrifice(fenBefore: string, uci: string): SacrificeCandidate | null {
  return inspectMaterialOffer(fenBefore, uci, 100, true);
}

function inspectMaterialOffer(fenBefore: string, uci: string, minimum: number, allowPawns: boolean): SacrificeCandidate | null {
  try {
    if (!UCI.test(uci)) return null;
    const game = new Chess(fenBefore);
    const rootMoves = legalUci(game);
    if (game.isGameOver() || rootMoves.length <= 1 || !rootMoves.includes(uci)) return null;
    const learner = game.turn();
    const rootMaterial = material(game, learner);
    const move = play(game, uci);
    if ((!allowPawns && move.piece === 'p') || move.piece === 'k' || move.promotion || game.isGameOver()) return null;
    const fenAfterMove = game.fen();
    const captures = game.moves({ verbose: true }).filter(reply => reply.to === move.to && reply.captured === move.piece);
    if (!captures.length || captures.length > 4) return null;
    const acceptances = captures.map(capture => {
      const after = new Chess(fenAfterMove);
      after.move(capture);
      const fenAfterAcceptance = after.fen();
      let bestImmediateMaterial = material(after, learner);
      // Take the most optimistic immediate recapture. If this already makes the
      // trade fair, merely putting a protected piece en prise is not a sacrifice.
      for (const recapture of after.moves({ verbose: true }).filter(reply => reply.to === capture.to && reply.captured)) {
        const recaptured = new Chess(fenAfterAcceptance);
        recaptured.move(recapture);
        bestImmediateMaterial = Math.max(bestImmediateMaterial, material(recaptured, learner));
      }
      return {
        uci: `${capture.from}${capture.to}${capture.promotion || ''}`, san: capture.san,
        fenAfterAcceptance, investmentCp: Math.max(0, rootMaterial - bestImmediateMaterial),
      };
    });
    if (!acceptances.some(acceptance => acceptance.investmentCp >= minimum)) return null;
    return { fenBefore: new Chess(fenBefore).fen(), fenAfterMove, uci, san: move.san, piece: move.piece, learner, acceptances };
  } catch { return null; }
}

type Score = EngineResult['score'];

function finiteScore(score: Score): score is NonNullable<Score> {
  return Boolean(score && (score.kind === 'cp' || score.kind === 'mate') && Number.isFinite(score.value));
}

function soundChoice(best: Score, chosen: Score, minimum = -35): boolean {
  if (!finiteScore(best) || !finiteScore(chosen)) return false;
  if (best.kind === 'mate') return best.value > 0 && chosen.kind === 'mate' && chosen.value > 0;
  if (chosen.kind === 'mate') return chosen.value > 0;
  return chosen.value >= minimum && best.value - chosen.value <= 40;
}

function clearlyWinning(score: Score): boolean {
  return finiteScore(score) && (score.kind === 'mate' ? score.value > 0 : score.value >= CLEAR_WIN_CP);
}

function acceptanceHolds(chosen: Score, accepted: Score, minimum = -35): boolean {
  if (!finiteScore(chosen) || !finiteScore(accepted)) return false;
  if (chosen.kind === 'mate') return chosen.value > 0 && accepted.kind === 'mate' && accepted.value > 0;
  if (accepted.kind === 'mate') return accepted.value > 0;
  return accepted.value >= Math.max(minimum, chosen.value - 80);
}

function meaningfulGap(chosen: Score, alternative: Score): boolean {
  return finiteScore(chosen) && finiteScore(alternative) && chosen.kind === 'cp' && alternative.kind === 'cp' &&
    chosen.value - alternative.value >= MEANINGFUL_GAP_CP;
}

/** Every legal defense must allow immediate mate, not merely the engine's PV.
 * Replay from the original FEN so move counters and the short line's history
 * survive. A draw, extra defensive resource or exhausted budget is no proof.
 */
function provesMateInTwo(candidate: SacrificeCandidate, signal?: AbortSignal): boolean {
  const board = new Chess(candidate.fenBefore);
  const attacker = board.turn();
  if (board.isGameOver()) return false;
  play(board, candidate.uci);
  if (board.isGameOver()) return false;
  const replies = legalUci(board);
  let visited = 0;
  for (const reply of replies) {
    abortIfNeeded(signal);
    if (++visited > MAX_MATE_PROOF_NODES) return false;
    play(board, reply);
    try {
      if (board.isGameOver() || board.turn() !== attacker) return false;
      let mates = false;
      for (const finish of legalUci(board)) {
        abortIfNeeded(signal);
        if (++visited > MAX_MATE_PROOF_NODES) return false;
        play(board, finish);
        // Checkmate takes precedence over a halfmove counter reaching 100.
        mates = board.isCheckmate() && board.turn() !== attacker;
        board.undo();
        if (mates) break;
      }
      if (!mates) return false;
    } finally { board.undo(); }
  }
  return replies.length > 0;
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Анализ отменён.'); error.name = 'AbortError'; throw error;
}

function usable(result: EngineResult, fen: string, allowed?: string[]): boolean {
  if (!finiteScore(result.score) || !Number.isFinite(result.depth) || result.depth < MIN_VERIFICATION_DEPTH || !result.bestMove) return false;
  if (result.score.kind === 'mate' && result.score.value === 0) return false;
  return legalUci(new Chess(fen)).includes(result.bestMove) && (!allowed || allowed.includes(result.bestMove));
}

/**
 * The baseline and forced-move scores use the same root/side-to-move POV.
 * After an opponent accepts the offer, it is the learner's turn again, so the
 * acceptance score is already learner POV: do not negate it for Black.
 * Cancellation propagates; any failed check means no badge. If another move
 * also wins, a cp-scored sacrifice must beat it by >=100cp in both the normal
 * and doubled-budget searches. A separately proven mate-in-two sacrifice can
 * qualify despite winning alternatives; all other guards still apply.
 * This is nonchalant's own criterion, not Chess.com's.
 */
export async function verifyBrilliantMove(
  candidate: SacrificeCandidate,
  before: EngineResult,
  chosen: EngineResult,
  engine: EngineLike,
  options: { nodes: number; signal?: AbortSignal },
): Promise<{ brilliant: boolean; reason?: string }> {
  return verifyMaterialOffer(candidate, before, chosen, engine, options, 'brilliant');
}

/** Independent Tal profile: adequate compensation, not a site's !! award.
 * The return field is shared with the existing HUD transport for compatibility.
 */
export async function verifySoundSacrifice(
  candidate: SacrificeCandidate,
  before: EngineResult,
  chosen: EngineResult,
  engine: EngineLike,
  options: { nodes: number; signal?: AbortSignal },
): Promise<{ brilliant: boolean; reason?: string }> {
  return verifyMaterialOffer(candidate, before, chosen, engine, options, 'sound-sacrifice');
}

async function verifyMaterialOffer(
  candidate: SacrificeCandidate,
  before: EngineResult,
  chosen: EngineResult,
  engine: EngineLike,
  options: { nodes: number; signal?: AbortSignal },
  profile: 'brilliant' | 'sound-sacrifice',
): Promise<{ brilliant: boolean; reason?: string }> {
  const no = { brilliant: false };
  const minimumScore = profile === 'sound-sacrifice' ? 0 : -35;
  const minimumInvestment = profile === 'sound-sacrifice' ? 100 : MIN_INVESTMENT_CP;
  abortIfNeeded(options.signal);
  try {
    if (!Number.isSafeInteger(options.nodes) || options.nodes <= 0 || !soundChoice(before.score, chosen.score, minimumScore)) return no;
    // Recreate the legal branches instead of trusting a caller-mutated candidate.
    const inspected = profile === 'sound-sacrifice' ? inspectSoundSacrifice(candidate.fenBefore, candidate.uci) : inspectSacrifice(candidate.fenBefore, candidate.uci);
    if (!inspected) return no;
    const nodes = Math.max(MIN_VERIFICATION_NODES, options.nodes);
    let verificationNodes = nodes;
    const analyze = async (fen: string, searchMoves?: string[]) => {
      abortIfNeeded(options.signal);
      const result = await engine.analyze(fen, { nodes: verificationNodes, ...(searchMoves ? { searchMoves } : {}) });
      abortIfNeeded(options.signal);
      return result;
    };
    let strongBest = await analyze(inspected.fenBefore);
    if (!usable(strongBest, inspected.fenBefore)) return no;
    let strongChosen = strongBest.bestMove === inspected.uci ? strongBest : await analyze(inspected.fenBefore, [inspected.uci]);
    if (!usable(strongChosen, inspected.fenBefore, [inspected.uci]) || !soundChoice(strongBest.score, strongChosen.score, minimumScore)) return no;
    let shortMate = false;

    if (profile === 'brilliant' && clearlyWinning(strongBest.score)) {
      const alternatives = legalUci(new Chess(inspected.fenBefore)).filter(move => move !== inspected.uci);
      const alternative = await analyze(inspected.fenBefore, alternatives);
      if (!usable(alternative, inspected.fenBefore, alternatives)) return no;
      if (clearlyWinning(alternative.score)) {
        // A smothered-mate offer can be brilliant even when another check
        // repeats the position before reaching the same sacrifice later.
        // Do not trust a mate score alone or penalize an available mate in one.
        shortMate = strongChosen.score?.kind === 'mate' && strongChosen.score.value === 2 &&
          !(strongBest.score?.kind === 'mate' && strongBest.score.value === 1) && provesMateInTwo(inspected, options.signal);
        if (!shortMate) {
          if (!meaningfulGap(strongChosen.score, alternative.score) || !Number.isSafeInteger(nodes * 2)) return no;
          verificationNodes = nodes * 2;
          const deeperBest = await analyze(inspected.fenBefore);
          if (!usable(deeperBest, inspected.fenBefore)) return no;
          const deeperChosen = deeperBest.bestMove === inspected.uci ? deeperBest : await analyze(inspected.fenBefore, [inspected.uci]);
          const deeperAlternative = await analyze(inspected.fenBefore, alternatives);
          if (!usable(deeperChosen, inspected.fenBefore, [inspected.uci]) || !usable(deeperAlternative, inspected.fenBefore, alternatives) ||
            !soundChoice(deeperBest.score, deeperChosen.score) || !meaningfulGap(deeperChosen.score, deeperAlternative.score)) return no;
          strongBest = deeperBest; strongChosen = deeperChosen;
        }
      }
    }

    for (const acceptance of inspected.acceptances) {
      const after = new Chess(acceptance.fenAfterAcceptance);
      if (after.isGameOver()) {
        // A proven draw can be adequate compensation for Tal's equal position;
        // it cannot replace a forced win or rescue an unsound material offer.
        if (profile !== 'sound-sacrifice' || !after.isDraw() || after.isCheckmate() ||
          !acceptanceHolds(strongChosen.score, { kind: 'cp', value: 0 }, minimumScore)) return no;
        continue;
      }
      const accepted = await analyze(acceptance.fenAfterAcceptance);
      if (!usable(accepted, acceptance.fenAfterAcceptance) || !acceptanceHolds(strongChosen.score, accepted.score, minimumScore)) return no;
    }
    const offer = inspected.acceptances.find(acceptance => acceptance.investmentCp >= minimumInvestment)!;
    const investment = (offer.investmentCp / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    return {
      brilliant: true,
      reason: `Жертва ${NAMES[inspected.piece]}: ${inspected.san}. Материальная уступка при ${offer.san}: около ${investment} п. с учётом возможного немедленного обратного взятия. ${shortMate ? 'Полный перебор легальных защит подтверждает мат следующим ходом после любого ответа на жертву. ' : ''}${profile === 'sound-sacrifice' ? 'Усиленная проверка предложения и принятия подтверждает достаточную компенсацию по критериям Tal HUD Mentality.' : 'Усиленная проверка принятия сохраняет оценку; это критерий «!!» nonchalant.'}`,
    };
  } catch (caught) {
    abortIfNeeded(options.signal);
    if (caught instanceof Error && caught.name === 'AbortError') throw caught;
    return no;
  }
}
