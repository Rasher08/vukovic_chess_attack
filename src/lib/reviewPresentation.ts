import { REVIEW_LABELS } from './gameReview';
import { getVerifiedHighlightReason, hasVerifiedAdventure, safeReviewClassification } from './reviewHighlights';
import type { ReviewClassification, ReviewMoveResult } from '@/types/gameReview';

/** Opening knowledge is presentation metadata, never a stored engine grade. */
export type ReviewDisplayKind = ReviewClassification | 'book';
export interface ReviewBookMove { eco: string; name: string }

export const REVIEW_DISPLAY_LABELS: Record<ReviewDisplayKind, string> = {
  ...REVIEW_LABELS, book: 'Теория',
};
export const REVIEW_DISPLAY_SYMBOLS: Record<ReviewDisplayKind, string> = {
  trilliant: '!!!', brilliant: '!!', great: '!', best: '★', excellent: '👍', good: '✓', inaccuracy: '?!',
  mistake: '?', miss: '×', blunder: '??', forced: '•', unverified: '—', book: '📖',
};
export const REVIEW_ADVENTURE_LABEL = 'Авантюрный';
export const REVIEW_ADVENTURE_DESCRIPTION = 'Жертва не проходит против точной защиты. На этой глубине движок нашёл узкий путь к преимуществу: основная оценка ошибки сохраняется. Это не вероятность того, что соперник найдёт ответ.';

/** Preserve warnings and verified highlights when recognizing opening theory. */
export function reviewPresentation(result: ReviewMoveResult, book?: ReviewBookMove): {
  kind: ReviewDisplayKind; symbol: string; label: string;
} {
  const classification = safeReviewClassification(result);
  const isBook = book && typeof book.name === 'string' && book.name.trim().length > 0 &&
    ['best', 'excellent', 'good', 'forced'].includes(classification);
  const kind: ReviewDisplayKind = isBook ? 'book' : classification;
  return { kind, symbol: REVIEW_DISPLAY_SYMBOLS[kind], label: REVIEW_DISPLAY_LABELS[kind] };
}

/** New highlight explanations come from validated metrics, never persisted prose. */
export function reviewExplanation(move: ReviewMoveResult): string {
  const kind = safeReviewClassification(move);
  const verifiedReason = getVerifiedHighlightReason(move);
  if (verifiedReason) return verifiedReason;
  if (kind === 'unverified') return move.error || 'Движок не подтвердил оценку этого хода.';
  if (kind === 'forced') return 'В этой позиции был только один легальный ход. Он не включён в показатель точности.';
  if (kind === 'brilliant') return typeof move.brilliantReason === 'string' && move.brilliantReason.trim() ? move.brilliantReason : 'Жертва с дополнительной движковой проверкой по критерию nonchalant. Это не доказательство единственности хода.';
  if (kind === 'best') return 'Лучший ход по текущему анализу движка.';
  if (kind === 'excellent') return 'Сильное продолжение, почти не уступающее лучшей найденной оценке.';
  if (kind === 'good') return 'Продолжение сохраняет большую часть возможностей позиции.';
  const loss = move.lossWinPercent;
  return loss === null || !Number.isFinite(loss) ? 'Сравни свой ход с найденным продолжением.' : `Расчётные шансы уменьшились на ${loss.toFixed(1)} п.п. Сравни свой ход с линией движка и проверь ответ соперника.`;
}

export { hasVerifiedAdventure };
