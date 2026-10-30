import type { EngineResult } from '@/lib/autoTraining';

export type ReviewColor = 'w' | 'b';
export type ReviewBaseClassification = 'brilliant' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced' | 'unverified';
export type ReviewClassification = ReviewBaseClassification | 'great' | 'miss' | 'trilliant';
export interface ReviewHighlightEvidence {
  version: 1;
  kind: 'great' | 'miss' | 'trilliant';
  rootFen: string;
  moveUci: string;
  baseClassification: ReviewBaseClassification;
  reason: string;
  nodes: number;
  depth: number;
  bestScore: NonNullable<EngineResult['score']>;
  playedScore: NonNullable<EngineResult['score']>;
  alternative?: { uci: string; score: NonNullable<EngineResult['score']>; depth: number };
  previousOpponentLoss?: number;
  previousPly?: number;
  previousUci?: string;
  investmentCp?: number;
  acceptances?: { fen: string; uci: string; score: NonNullable<EngineResult['score']>; depth: number }[];
}
export interface ReviewAdventurousEvidence {
  version: 1; rootFen: string; moveUci: string; reason: string; nodes: number; depth: number;
  replyGapWinPercent: number; bestReplyUci: string; alternativeReplyUci: string;
  replyScore: NonNullable<EngineResult['score']>; alternativeReplyScore: NonNullable<EngineResult['score']>;
}

export interface ReviewPly {
  ply: number;
  moveNumber: number;
  color: ReviewColor;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
}

export interface ReviewGame {
  id: string;
  headers: Record<string, string>;
  initialFen: string;
  moves: ReviewPly[];
  pgn: string;
  result: string;
}

export interface ReviewMoveResult extends ReviewPly {
  classification: ReviewClassification;
  bestSan: string | null;
  pvSan: string[];
  beforeCpWhite: number | null;
  afterCpWhite: number | null;
  beforeScore: EngineResult['score'];
  playedScore: EngineResult['score'];
  lossCp: number | null;
  lossWinPercent: number | null;
  accuracy: number | null;
  depth: number;
  brilliantReason?: string;
  /** Preserve the numerical grade when a contextual highlight supplies the badge. */
  baseClassification?: ReviewBaseClassification;
  highlightEvidence?: ReviewHighlightEvidence;
  /** Secondary warning only: never replaces a mistake/blunder with a positive badge. */
  adventurous?: ReviewAdventurousEvidence;
  error?: string;
}

export interface ReviewPlayerSummary {
  accuracy: number | null;
  averageLossCp: number | null;
  counts: Record<ReviewClassification, number>;
  reviewedMoves: number;
  totalMoves: number;
}

export interface ReviewReport {
  /** Explicit overrides for the current relative game-rating display. Missing sides use PGN Elo. */
  performanceRatings?: { version: 1; white?: number | null; black?: number | null };
  /** Legacy metadata accepted for old reviews; no longer used or collected. */
  ratingInputs?: { white: number | null; black: number | null };
  version: 1;
  game: ReviewGame;
  results: ReviewMoveResult[];
  nodes: number;
  analyzedAt: number;
  completed: boolean;
  white: ReviewPlayerSummary;
  black: ReviewPlayerSummary;
}
