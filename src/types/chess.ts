import { Square } from 'chess.js';

/**
 * Символы оценки хода (Numeric Annotation Glyphs / NAG)
 */
export type NagType = '!' | '?' | '!!' | '??' | '!?' | '?!';

/**
 * Конфигурация графической стрелки на шахматной доске
 */
export interface ArrowConfig {
  from: Square;
  to: Square;
  color: string; // e.g. 'rgba(239, 68, 68, 0.8)' for threats, 'rgba(34, 197, 94, 0.8)' for moves
}

/**
 * Узел в дереве ходов и вариантов партии
 */
export interface MoveNode {
  id: string;
  san: string;
  uci: string;
  fen: string;
  turn: 'w' | 'b';
  comment?: string;
  nag?: NagType;
  arrows?: ArrowConfig[];
  highlights?: Record<string, string>;
  isForced?: boolean;
  isBlunderRefutation?: boolean;
  blunderExplanation?: string;
  children: MoveNode[];
}

/**
 * Чек-лист предпосылок Вуковича для классической жертвы слона (Greek Gift)
 */
export interface PrerequisiteChecklist {
  pawnOnE5: boolean;
  knightOnF6Absent: boolean;
  whiteBishopOnD3orC4: boolean;
  whiteKnightOnG5Available: boolean;
  whiteQueenOnH5orD3Available: boolean;
  h4PawnSupportReady: boolean;
  notes: string;
}

/**
 * Идентификаторы глав курса
 */
export type ChapterId = 'greek_gift' | 'rook_lift' | 'pawn_demolition' | 'king_hunt';

/**
 * Полная модель учебного этюда по Вуковичу
 */
export interface VukovicStudy {
  id: string;
  title: string;
  white: string;
  black: string;
  year?: number;
  event?: string;
  eco?: string;
  initialFen: string;
  orientation: 'white' | 'black';
  chapter: ChapterId;
  chapterTitle: string;
  difficulty: 1800 | 2000 | 2200;
  tags: string[];
  description: string;
  prerequisites?: PrerequisiteChecklist;
  rootNode: MoveNode;
  calculationTargetPlies: number;
}

/**
 * Краткая сводка этюда для каталога
 */
export interface StudySummary {
  id: string;
  title: string;
  white: string;
  black: string;
  year?: number;
  eco?: string;
  chapter: ChapterId;
  chapterTitle: string;
  difficulty: 1800 | 2000 | 2200;
  tags: string[];
  description: string;
  calculationTargetPlies: number;
}

/**
 * Описание главы каталога
 */
export interface ChapterInfo {
  id: ChapterId;
  title: string;
  subtitle: string;
  description: string;
  iconName: string;
  studiesCount: number;
}
