import { Chess } from 'chess.js';
import { VukovicStudy, MoveNode } from '@/types/chess';
import { isValidFen } from './chessUtils';

/**
 * Результат валидации отдельного этюда
 */
export interface StudyValidationResult {
  studyId: string;
  title: string;
  valid: boolean;
  totalNodes: number;
  maxDepth: number;
  errors: string[];
  warnings: string[];
}

/**
 * Итоговая сводка валидации всего датасета
 */
export interface DatasetValidationSummary {
  totalStudies: number;
  validStudies: number;
  failedStudies: number;
  totalMovesVerified: number;
  results: StudyValidationResult[];
}

/**
 * Рекурсивно проверяет дерево ходов
 */
function validateNodeTree(
  node: MoveNode,
  parentFen: string,
  depth: number,
  errors: string[],
  warnings: string[],
  nodeCounter: { count: number; maxDepth: number }
): void {
  nodeCounter.count += 1;
  if (depth > nodeCounter.maxDepth) {
    nodeCounter.maxDepth = depth;
  }

  // 1. Проверяем валидность хода из позиции родителя
  let chess: Chess;
  try {
    chess = new Chess(parentFen);
  } catch {
    errors.push(`Узел ${node.id} (${node.san}): Невалидный родительский FEN: ${parentFen}`);
    return;
  }

  const expectedTurn = chess.turn();
  if (node.turn !== expectedTurn) {
    errors.push(
      `Узел ${node.id} (${node.san}): Несоответствие очереди хода. Ожидалось '${expectedTurn}', указано '${node.turn}'`
    );
  }

  let moveResult;
  try {
    moveResult = chess.move(node.san);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Узел ${node.id} (${node.san}): Нелегальный ход из позиции: ${parentFen} (${msg})`);
    return;
  }

  if (!moveResult) {
    errors.push(`Узел ${node.id} (${node.san}): Ход не выполнен (нелегальный) из позиции: ${parentFen}`);
    return;
  }

  // 2. Сверяем полученный FEN с записанным в узле
  const generatedFen = chess.fen();
  // Сравниваем позиции (первые 4 поля FEN: расположение фигур, очередь хода, рокировки, битое поле)
  const normGen = generatedFen.split(' ').slice(0, 4).join(' ');
  const normNode = node.fen.split(' ').slice(0, 4).join(' ');
  if (normGen !== normNode) {
    errors.push(
      `Узел ${node.id} (${node.san}): Несовпадение FEN.\nОжидался: ${generatedFen}\nЗаписан:  ${node.fen}`
    );
  }

  // 3. Проверяем UCI нотацию
  const expectedUci = `${moveResult.from}${moveResult.to}${moveResult.promotion ? moveResult.promotion : ''}`;
  if (node.uci && node.uci !== expectedUci) {
    warnings.push(
      `Узел ${node.id} (${node.san}): UCI '${node.uci}' отличается от рассчитанного '${expectedUci}'`
    );
  }

  // 4. Если ход матующий, проверяем шахматное состояние
  if (node.san.includes('#') && !chess.isCheckmate()) {
    errors.push(`Узел ${node.id} (${node.san}): Нотация содержит '#', но позиция не является матом`);
  }

  // 5. Проверка объяснения ошибки для узлов-опровержений
  if (node.isBlunderRefutation && !node.blunderExplanation && !node.comment) {
    warnings.push(`Узел ${node.id} (${node.san}): Отмечен как isBlunderRefutation, но нет пояснения ошибки`);
  }

  // 6. Рекурсивно проверяем всех потомков
  for (const child of node.children) {
    validateNodeTree(child, generatedFen, depth + 1, errors, warnings, nodeCounter);
  }
}

/**
 * Проверяет корректность отдельного этюда по Вуковичу
 * @param study Этюд для проверки
 */
export function validateStudy(study: VukovicStudy): StudyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeCounter = { count: 0, maxDepth: 0 };

  // 1. Проверяем валидность стартового FEN
  if (!isValidFen(study.initialFen)) {
    errors.push(`Невалидный стартовый FEN: ${study.initialFen}`);
    return {
      studyId: study.id,
      title: study.title,
      valid: false,
      totalNodes: 0,
      maxDepth: 0,
      errors,
      warnings,
    };
  }

  // 2. Валидация дерева ходов
  validateNodeTree(study.rootNode, study.initialFen, 1, errors, warnings, nodeCounter);

  return {
    studyId: study.id,
    title: study.title,
    valid: errors.length === 0,
    totalNodes: nodeCounter.count,
    maxDepth: nodeCounter.maxDepth,
    errors,
    warnings,
  };
}

/**
 * Валидирует весь массив этюдов
 * @param studies Список этюдов
 */
export function validateDataset(studies: VukovicStudy[]): DatasetValidationSummary {
  const results = studies.map(validateStudy);
  const validStudies = results.filter((r) => r.valid).length;
  const failedStudies = results.filter((r) => !r.valid).length;
  const totalMovesVerified = results.reduce((sum, r) => sum + r.totalNodes, 0);

  return {
    totalStudies: studies.length,
    validStudies,
    failedStudies,
    totalMovesVerified,
    results,
  };
}
