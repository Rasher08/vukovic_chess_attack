import React from 'react';
import { Chess, Square, Move } from 'chess.js';
import { MoveNode, ArrowConfig } from '@/types/chess';

/**
 * Создает экземпляр шахматного движка с валидацией позиции
 * @param fen FEN-строка начальной позиции
 */
export function createChessInstance(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess();
}

/**
 * Проверяет корректность FEN-строки
 * @param fen FEN-строка
 * @returns true, если FEN валиден
 */
export function isValidFen(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    return Boolean(chess.fen());
  } catch {
    return false;
  }
}

/**
 * Выполняет ход по SAN или UCI и возвращает результат
 * @param fen Исходный FEN
 * @param moveSanOrUci Ход в формате SAN ('Nf3') или объекте { from, to, promotion }
 * @returns { success: boolean, newFen: string, move?: Move, error?: string }
 */
export function makeMove(
  fen: string,
  moveSanOrUci: string | { from: Square; to: Square; promotion?: string }
): { success: boolean; newFen: string; move?: Move; error?: string } {
  try {
    const chess = new Chess(fen);
    const result = chess.move(moveSanOrUci);
    if (!result) {
      return { success: false, newFen: fen, error: 'Нелегальный ход' };
    }
    return {
      success: true,
      newFen: chess.fen(),
      move: result,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка хода';
    return { success: false, newFen: fen, error: message };
  }
}

/**
 * Возвращает список всех легальных ходов из данной позиции
 * @param fen Текущий FEN
 */
export function getLegalMoves(fen: string): Move[] {
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: true });
  } catch {
    return [];
  }
}

/**
 * Проверяет, находится ли король стороны под шахом
 * @param fen Текущий FEN
 */
export function isCheck(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    return chess.inCheck();
  } catch {
    return false;
  }
}

/**
 * Проверяет, поставлен ли мат
 * @param fen Текущий FEN
 */
export function isCheckmate(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    return chess.isCheckmate();
  } catch {
    return false;
  }
}

/**
 * Возвращает цвет стороны, чья очередь ходить ('w' или 'b')
 * @param fen Текущий FEN
 */
export function getActiveColor(fen: string): 'w' | 'b' {
  try {
    const chess = new Chess(fen);
    return chess.turn();
  } catch {
    return 'w';
  }
}

/**
 * Возвращает фигуру на указанном поле
 * @param fen Текущий FEN
 * @param square Идентификатор поля ('e4', 'd5' и т.д.)
 */
export function getPieceAtSquare(
  fen: string,
  square: Square
): { type: string; color: 'w' | 'b' } | null {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(square);
    return piece ? { type: piece.type, color: piece.color } : null;
  } catch {
    return null;
  }
}

/**
 * Возвращает все легальные ходы для указанного поля
 * @param fen Текущий FEN
 * @param square Выбранное поле
 */
export function getLegalMovesForSquare(fen: string, square: Square): Move[] {
  try {
    const chess = new Chess(fen);
    return chess.moves({ square, verbose: true });
  } catch {
    return [];
  }
}

/**
 * Возвращает массив целевых полей, на которые может пойти фигура с данного поля
 * @param fen Текущий FEN
 * @param square Выбранное поле
 */
export function getLegalTargetSquares(fen: string, square: Square): Square[] {
  const moves = getLegalMovesForSquare(fen, square);
  return Array.from(new Set(moves.map((m) => m.to)));
}

/**
 * Проверяет, является ли ход пешечным превращением
 * @param fen Текущий FEN
 * @param from Исходное поле
 * @param to Целевое поле
 */
export function isPromotion(fen: string, from: Square, to: Square): boolean {
  try {
    const chess = new Chess(fen);
    const piece = chess.get(from);
    if (!piece || piece.type !== 'p') {
      return false;
    }

    const isWhitePromotion = piece.color === 'w' && from[1] === '7' && to[1] === '8';
    const isBlackPromotion = piece.color === 'b' && from[1] === '2' && to[1] === '1';

    if (!isWhitePromotion && !isBlackPromotion) {
      return false;
    }

    // Проверяем, существует ли легальный ход на это поле с флагом promotion
    const legalMoves = chess.moves({ square: from, verbose: true });
    return legalMoves.some((m) => m.to === to && Boolean(m.promotion));
  } catch {
    return false;
  }
}

/**
 * Проверяет, является ли ход взятием (обычным или на проходе)
 * @param fen Текущий FEN
 * @param from Исходное поле
 * @param to Целевое поле
 */
export function isCaptureSquare(fen: string, from: Square, to: Square): boolean {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ square: from, verbose: true });
    const targetMove = moves.find((m) => m.to === to);
    if (!targetMove) return false;
    return Boolean(targetMove.captured) || targetMove.flags.includes('c') || targetMove.flags.includes('e');
  } catch {
    return false;
  }
}

/**
 * Находит поле, на котором стоит король указанного цвета (по умолчанию - короля активной стороны)
 * @param fen Текущий FEN
 * @param color 'w' или 'b'
 */
export function findKingSquare(fen: string, color?: 'w' | 'b'): Square | null {
  try {
    const chess = new Chess(fen);
    const targetColor = color || chess.turn();

    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

    for (const r of ranks) {
      for (const f of files) {
        const sq = `${f}${r}` as Square;
        const piece = chess.get(sq);
        if (piece && piece.type === 'k' && piece.color === targetColor) {
          return sq;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Возвращает подсветку для короля, если он находится под шахом
 * @param fen Текущий FEN
 */
export function getCheckHighlightStyle(fen: string): Record<string, React.CSSProperties> {
  if (!isCheck(fen)) {
    return {};
  }
  const kingSq = findKingSquare(fen);
  if (!kingSq) {
    return {};
  }

  return {
    [kingSq]: {
      backgroundColor: 'rgba(239, 68, 68, 0.75)',
      boxShadow: '0 0 16px rgba(239, 68, 68, 0.95)',
      borderRadius: '6px',
    },
  };
}

/**
 * Палитра стрелок Вуковича для семантического анализа и тактических подсказок
 */
export const VUKOVIC_ARROW_PALETTE = {
  THREAT: 'rgba(239, 68, 68, 0.9)', // Красный: Прямые угрозы, матовые конструкции, взятия
  MANEUVER: 'rgba(34, 197, 94, 0.85)', // Зеленый: Позиционные маневры, пешечные прорывы (h4!)
  KNIGHT_JUMP: 'rgba(59, 130, 246, 0.85)', // Синий: Прыжки и форпосты коней (Nf3-g5)
  SACRIFICE: 'rgba(245, 158, 11, 0.95)', // Золотой/Янтарный: Жертвы на h7/g7 (Bxh7+!)
  DEFENSE: 'rgba(168, 85, 247, 0.85)', // Фиолетовый: Ресурсы защиты черных (Re8, f5)
} as const;

/**
 * Формирует стили подсветки для легальных ходов, выбранного поля, последнего хода и шаха
 */
export function getSquareHighlightStyles(params: {
  fen: string;
  selectedSquare: Square | null;
  lastMove?: { from: Square; to: Square } | null;
  customSquareStyles?: Record<string, React.CSSProperties>;
}): Record<string, React.CSSProperties> {
  const { fen, selectedSquare, lastMove, customSquareStyles = {} } = params;
  const styles: Record<string, React.CSSProperties> = {};

  // 1. Подсветка последнего хода (откуда и куда)
  if (lastMove) {
    styles[lastMove.from] = {
      backgroundColor: 'rgba(250, 204, 21, 0.35)',
      boxShadow: 'inset 0 0 0 1px rgba(234, 179, 8, 0.5)',
    };
    styles[lastMove.to] = {
      backgroundColor: 'rgba(250, 204, 21, 0.45)',
      boxShadow: 'inset 0 0 0 2px rgba(234, 179, 8, 0.7)',
    };
  }

  // 2. Подсветка шаха королю
  if (isCheck(fen)) {
    const kingSq = findKingSquare(fen);
    if (kingSq) {
      styles[kingSq] = {
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        boxShadow: '0 0 16px rgba(239, 68, 68, 1)',
        borderRadius: '4px',
      };
    }
  }

  // 3. Если выбрано поле с фигурой активного игрока
  if (selectedSquare) {
    // Подсветка самого выбранного поля
    styles[selectedSquare] = {
      backgroundColor: 'rgba(245, 158, 11, 0.5)',
      boxShadow: 'inset 0 0 0 3px rgba(245, 158, 11, 0.9)',
      borderRadius: '4px',
    };

    // Расчет точек для легальных ходов
    const legalMoves = getLegalMovesForSquare(fen, selectedSquare);
    for (const move of legalMoves) {
      const isCapture =
        Boolean(move.captured) || move.flags.includes('c') || move.flags.includes('e');

      if (isCapture) {
        // Кольцо взятия (прицел) на поле с вражеской фигурой
        styles[move.to] = {
          background: 'radial-gradient(circle, transparent 58%, rgba(239, 68, 68, 0.8) 60%)',
          borderRadius: '50%',
          cursor: 'pointer',
        };
      } else {
        // Аккуратная изумрудная точка в центре свободного поля
        styles[move.to] = {
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.75) 24%, transparent 25%)',
          borderRadius: '50%',
          cursor: 'pointer',
        };
      }
    }
  }

  // 4. Накладываем пользовательские стили (customSquareStyles) с наивысшим приоритетом
  return {
    ...styles,
    ...customSquareStyles,
  };
}

/**
 * Рекурсивно находит узел в дереве ходов по ID
 * @param root Корневой узел дерева ходов
 * @param targetId Искомый идентификатор узла
 */
export function findNodeById(root: MoveNode, targetId: string): MoveNode | null {
  if (root.id === targetId) return root;
  for (const child of root.children) {
    const found = findNodeById(child, targetId);
    if (found) return found;
  }
  return null;
}

/**
 * Находит путь от корня до указанного узла (список узлов)
 * @param root Корневой узел
 * @param targetId ID целевого узла
 */
export function findPathToNode(root: MoveNode, targetId: string): MoveNode[] {
  if (root.id === targetId) return [root];
  for (const child of root.children) {
    const path = findPathToNode(child, targetId);
    if (path.length > 0) {
      return [root, ...path];
    }
  }
  return [];
}

/**
 * Извлекает главную линию (последовательность первых дочерних узлов)
 * @param root Корневой узел
 */
export function getMainLine(root: MoveNode): MoveNode[] {
  const line: MoveNode[] = [root];
  let current: MoveNode = root;
  while (current.children && current.children.length > 0) {
    // Первый дочерний узел считается главной линией
    current = current.children[0];
    line.push(current);
  }
  return line;
}

/**
 * Собирает все узлы дерева в плоский массив
 * @param root Корневой узел
 */
export function getAllNodes(root: MoveNode): MoveNode[] {
  const nodes: MoveNode[] = [root];
  for (const child of root.children) {
    nodes.push(...getAllNodes(child));
  }
  return nodes;
}

/**
 * Преобразует стрелки ArrowConfig в формат для react-chessboard: [Square, Square, string?][]
 * @param arrows Массив конфигураций стрелок
 */
export function formatArrowsForBoard(arrows?: ArrowConfig[]): [Square, Square, string?][] {
  if (!arrows) return [];
  return arrows.map((arrow) => [arrow.from, arrow.to, arrow.color]);
}
