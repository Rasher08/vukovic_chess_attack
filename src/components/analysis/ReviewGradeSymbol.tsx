import { BookOpen, ThumbsUp } from 'lucide-react';
import { REVIEW_DISPLAY_SYMBOLS, type ReviewDisplayKind } from '@/lib/reviewPresentation';

/** Keep badge shapes identical in the board, move list, summary and guide. */
export function ReviewGradeSymbol({ kind }: { kind: ReviewDisplayKind }) {
  if (kind === 'excellent') return <ThumbsUp width="65%" height="65%" strokeWidth={2.5} aria-hidden="true" />;
  if (kind === 'book') return <BookOpen width="64%" height="64%" strokeWidth={2.2} aria-hidden="true" />;
  return <>{REVIEW_DISPLAY_SYMBOLS[kind]}</>;
}
