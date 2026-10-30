import { Chess } from 'chess.js';
import { MoveNode, NagType, ArrowConfig, VukovicStudy, ChapterId, PrerequisiteChecklist } from '@/types/chess';

/**
 * Упрощенное определение узла для создания датасета
 */
export interface NodeInput {
  id: string;
  san: string;
  comment?: string;
  nag?: NagType;
  arrows?: ArrowConfig[];
  highlights?: Record<string, string>;
  isForced?: boolean;
  isBlunderRefutation?: boolean;
  blunderExplanation?: string;
  children?: NodeInput[];
}

/**
 * Входные данные для создания учебного этюда
 */
export interface StudyInput {
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
  calculationTargetPlies: number;
  rootNode: NodeInput;
}

/**
 * Рекурсивно строит проверенное дерево ходов с гарантией легальности FEN и UCI от chess.js
 */
export function buildVerifiedNode(parentFen: string, input: NodeInput): MoveNode {
  const chess = new Chess(parentFen);
  const turn = chess.turn();

  let moveResult;
  try {
    moveResult = chess.move(input.san);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Ошибка построения узла ${input.id} (${input.san}) из позиции ${parentFen}: ${msg}`
    );
  }

  if (!moveResult) {
    throw new Error(
      `Нелегальный ход ${input.san} в узле ${input.id} из позиции ${parentFen}`
    );
  }

  const generatedFen = chess.fen();
  const uci = `${moveResult.from}${moveResult.to}${moveResult.promotion ? moveResult.promotion : ''}`;

  const children: MoveNode[] = (input.children || []).map((childInput) =>
    buildVerifiedNode(generatedFen, childInput)
  );

  return {
    id: input.id,
    san: moveResult.san,
    uci,
    fen: generatedFen,
    turn,
    comment: input.comment,
    nag: input.nag,
    arrows: input.arrows,
    highlights: input.highlights,
    isForced: input.isForced,
    isBlunderRefutation: input.isBlunderRefutation,
    blunderExplanation: input.blunderExplanation,
    children,
  };
}

/**
 * Создает валидированный объект VukovicStudy
 */
export function createVukovicStudy(input: StudyInput): VukovicStudy {
  const rootNode = buildVerifiedNode(input.initialFen, input.rootNode);

  return {
    id: input.id,
    title: input.title,
    white: input.white,
    black: input.black,
    year: input.year,
    event: input.event,
    eco: input.eco,
    initialFen: input.initialFen,
    orientation: input.orientation,
    chapter: input.chapter,
    chapterTitle: input.chapterTitle,
    difficulty: input.difficulty,
    tags: input.tags,
    description: input.description,
    prerequisites: input.prerequisites,
    rootNode,
    calculationTargetPlies: input.calculationTargetPlies,
  };
}
