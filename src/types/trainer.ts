import { Square } from 'chess.js';
import type React from 'react';

/**
 * Состояния конечного автомата тренажера глубокого расчета (FSM)
 */
export type TrainerState =
  | 'IDLE'
  | 'WAITING_USER_MOVE'
  | 'EVALUATING_USER_MOVE'
  | 'STEP_SUCCESS'
  | 'ANIMATING_OPPONENT'
  | 'MISTAKE_EXPLANATION'
  | 'STUDY_COMPLETED'
  | 'ANALYSIS_MODE';

/**
 * Подробности тактической ошибки и ее опровержения
 */
export interface BlunderDetail {
  attemptedSan: string;
  punishmentSan: string;
  punishmentFen: string;
  explanation: string;
  arrows: [Square, Square, string?][];
  highlights: Record<string, React.CSSProperties>;
}

/**
 * Прогресс расчета и метрики решения задачи
 */
export interface CalculationProgress {
  studyId: string;
  currentStepIndex: number;
  totalSteps: number;
  mistakesCount: number;
  hintsUsedCount: number;
  startTime: number;
  elapsedSeconds: number;
  completed: boolean;
  accuracyScore: number;
}

/**
 * Уровни трехуровневой системы подсказок
 */
export type HintLevel = 1 | 2 | 3;

/**
 * Структура подсказки
 */
export interface HintInfo {
  level: HintLevel;
  title: string;
  text: string;
  highlightPieceSquare?: Square;
  targetSquare?: Square;
}

/**
 * Результат оценки хода пользователя
 */
export type MoveEvaluationResult =
  | { type: 'CORRECT'; nextOpponentMove?: string; isCompleted: boolean }
  | { type: 'ALTERNATIVE'; comment: string; nextOpponentMove?: string; isCompleted: boolean }
  | { type: 'BLUNDER'; blunder: BlunderDetail }
  | { type: 'ILLEGAL'; reason: string };
