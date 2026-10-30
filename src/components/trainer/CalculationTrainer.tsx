'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Square, Chess } from 'chess.js';
import { VukovicStudy } from '@/types/chess';
import { TrainerState, BlunderDetail, HintLevel } from '@/types/trainer';
import { playMoveSound, playCaptureSound } from '@/lib/audioSynth';
import { saveStudyRecord } from '@/lib/storage';
import ChessboardWrapper from '@/components/chess/ChessboardWrapper';
import PromotionModal from '@/components/chess/PromotionModal';
import HintPanel, { HintSpec } from './HintPanel';
import BlunderModal from './BlunderModal';
import CalculationScoreCard, { CalculationSessionSummary, StepScoreItem } from './CalculationScoreCard';
import {
  Clock,
  Target,
  Zap,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Shield,
  HelpCircle,
} from 'lucide-react';

export interface CalculationStepSpec {
  stepIndex: number;
  moveNumber: number;
  fenBefore: string;
  expectedFenAfter: string;
  bestMoveSan: string;
  bestMoveUci: string;
  bestMoveExplanation: string;
  alternativeMoves?: { san: string; uci: string; explanation: string }[];
  inaccuracies?: { san: string; uci: string; explanation: string }[];
  blunders?: {
    san: string;
    uci: string;
    refutationSan: string;
    refutationUci: string;
    refutationFen: string;
    explanation: string;
  }[];
  hints: {
    level1Concept: string;
    level2Highlight: { fromSquare?: string; toSquare?: string };
    level3Arrow: [string, string];
  };
  opponentResponse?: {
    san: string;
    uci: string;
    fenAfter: string;
    comment: string;
  };
}

export interface CalculationTrainerProps {
  study: VukovicStudy;
  onSwitchToAnalysis: () => void;
  onNextStudy?: () => void;
  className?: string;
}

/**
 * Извлекает или формирует спецификацию шагов глубокого расчета для любого этюда каталога
 */
export function getCalculationStepsForStudy(study: VukovicStudy): CalculationStepSpec[] {
  // Специализированная каноническая ветка для Эдгара Колле — Джона О'Хэнлона (1930)
  if (study.id === 'colle-ohanlon-1930') {
    return [
      {
        stepIndex: 0,
        moveNumber: 12,
        fenBefore: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
        expectedFenAfter: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
        bestMoveSan: 'Bxh7+',
        bestMoveUci: 'e4h7',
        bestMoveExplanation: 'Классическая жертва слона (Greek Gift). Защитный конь f6 отсутствует.',
        hints: {
          level1Concept: 'Разрушьте пешечный щит черного короля классической жертвой на h7.',
          level2Highlight: { fromSquare: 'e4', toSquare: 'h7' },
          level3Arrow: ['e4', 'h7'],
        },
        opponentResponse: {
          san: 'Kxh7',
          uci: 'g8h7',
          fenAfter: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
          comment: 'Черные принимают жертву.',
        },
      },
      {
        stepIndex: 1,
        moveNumber: 13,
        fenBefore: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
        expectedFenAfter: 'r1bqr3/pp1n1ppk/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13',
        bestMoveSan: 'Ng5+',
        bestMoveUci: 'f3g5',
        bestMoveExplanation: 'Конь вторгается на g5 с шахом, подключая атакующие резервы.',
        hints: {
          level1Concept: 'Подключите вторую легкую фигуру с форсированным шахом.',
          level2Highlight: { fromSquare: 'f3', toSquare: 'g5' },
          level3Arrow: ['f3', 'g5'],
        },
        opponentResponse: {
          san: 'Kg6',
          uci: 'h7g6',
          fenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
          comment: 'Самое упорное возражение черных: король идет вперед на g6!',
        },
      },
      {
        stepIndex: 2,
        moveNumber: 14,
        fenBefore: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
        expectedFenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
        bestMoveSan: 'h4!',
        bestMoveUci: 'h2h4',
        bestMoveExplanation: 'Ключевой ход Вуковича! Пешечный таран 14.h4! строит капкан.',
        blunders: [
          {
            san: 'Qh5',
            uci: 'd1h5',
            refutationSan: 'Bxg5',
            refutationUci: 'c8g5',
            refutationFen: 'r1bqr3/pp1n1pp1/3bp1k1/6bQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 0 15',
            explanation:
              'Грубейшая ошибка! Преждевременный шах 14.Qh5?? позволяет черным бесплатно забрать коня 14...Bxg5! с выигранной позицией.',
          },
          {
            san: 'Qg4',
            uci: 'd1g4',
            refutationSan: 'f5',
            refutationUci: 'f7f5',
            refutationFen: 'r1bqr3/pp1n2p1/3bp1k1/5pN1/3p2Q1/2P5/PP3PPP/R1B1R1K1 w - - 0 15',
            explanation:
              'Неточность, выпускающая инициативу! Шах 14.Qg4? натыкается на контратакующий тычок 14...f5!, и король черных ускользает в безопасную зону.',
          },
        ],
        hints: {
          level1Concept: 'Отрежьте королю убежище продвижением крайней пешки.',
          level2Highlight: { fromSquare: 'h2', toSquare: 'h4' },
          level3Arrow: ['h2', 'h4'],
        },
        opponentResponse: {
          san: 'Rh8',
          uci: 'e8h8',
          fenAfter: 'r1bq3r/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 w - - 1 15',
          comment: 'Черные пытаются прикрыть пункт h5.',
        },
      },
      {
        stepIndex: 3,
        moveNumber: 15,
        fenBefore: 'r1bq3r/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 w - - 1 15',
        expectedFenAfter: 'r1bq3r/pp1n1pp1/3bR1k1/6N1/3p3P/2P5/PP3PP1/R1BQ2K1 b - - 0 15',
        bestMoveSan: 'Rxe6+!',
        bestMoveUci: 'e1e6',
        bestMoveExplanation: 'Гениальная жертва ладьи! Разрушение пешечной цепи e6.',
        hints: {
          level1Concept: 'Пожертвуйте тяжелую фигуру на e6 для вскрытия короля.',
          level2Highlight: { fromSquare: 'e1', toSquare: 'e6' },
          level3Arrow: ['e1', 'e6'],
        },
      },
    ];
  }

  // Общий алгоритмический экстрактор шагов расчета из дерева вариантов этюда
  const steps: CalculationStepSpec[] = [];
  let currentFen = study.initialFen;
  let currentNode = study.rootNode;
  let stepIndex = 0;
  let currentWhiteSiblings = [study.rootNode];

  // Извлекаем цепочку ходов белых и ответов черных по главной линии
  while (currentNode) {
    const isWhiteMove = currentNode.turn === 'w' || !currentNode.turn;
    const fenBefore = currentFen;
    const expectedFenAfter = currentNode.fen;

    const fromSquare = (currentNode.uci.slice(0, 2) || 'e4') as Square;
    const toSquare = (currentNode.uci.slice(2, 4) || 'h7') as Square;

    // Ищем упорный ответ черных (первый дочерний узел)
    let opponentResponse: CalculationStepSpec['opponentResponse'] = undefined;
    let nextWhiteNode: typeof study.rootNode | null = null;
    let nextWhiteSiblings: typeof study.rootNode[] = [];

    if (currentNode.children && currentNode.children.length > 0) {
      const blackNode = currentNode.children[0];
      opponentResponse = {
        san: blackNode.san,
        uci: blackNode.uci,
        fenAfter: blackNode.fen,
        comment: blackNode.comment || 'Защита черных по главной линии Вуковича.',
      };

      if (blackNode.children && blackNode.children.length > 0) {
        nextWhiteNode = blackNode.children[0];
        nextWhiteSiblings = blackNode.children;
        currentFen = blackNode.fen;
      }
    }

    // Извлекаем возможные ошибки и альтернативные ходы белых из ветвлений текущего полухода белых
    const blunders: CalculationStepSpec['blunders'] = [];
    const alternativeMoves: NonNullable<CalculationStepSpec['alternativeMoves']> = [];

    if (currentWhiteSiblings && currentWhiteSiblings.length > 1) {
      for (let i = 1; i < currentWhiteSiblings.length; i++) {
        const sibling = currentWhiteSiblings[i];
        const isBlunder =
          sibling.isBlunderRefutation ||
          (sibling.nag && sibling.nag.includes('?')) ||
          Boolean(sibling.blunderExplanation);

        if (isBlunder) {
          const refutationChild = sibling.children?.[0];
          blunders.push({
            san: sibling.san,
            uci: sibling.uci,
            refutationSan: refutationChild?.san || '??',
            refutationUci: refutationChild?.uci || sibling.uci || '',
            refutationFen: refutationChild?.fen || sibling.fen || fenBefore,
            explanation:
              sibling.blunderExplanation ||
              sibling.comment ||
              `Ошибка! Ход ${sibling.san} выпускает решающий перевес по концепции Вуковича.`,
          });
        } else {
          alternativeMoves.push({
            san: sibling.san,
            uci: sibling.uci,
            explanation:
              sibling.comment ||
              `Альтернативное верное продолжение атаки: ${sibling.san}`,
          });
        }
      }
    }

    // Поддержка дуальных победных матов для известных партий Вуковича
    if (study.id === 'ed-lasker-thomas-1912' && currentNode.san.includes('Kd2')) {
      if (!alternativeMoves.some((a) => a.san.includes('O-O-O'))) {
        alternativeMoves.push({
          san: 'O-O-O#',
          uci: 'e1c1',
          explanation: 'Эстетически безупречный мат длинной рокировкой!',
        });
      }
    } else if (study.id === 'tarrasch-scheve-1894' && currentNode.san.includes('Rxf8')) {
      if (!alternativeMoves.some((a) => a.san.includes('Qxf8'))) {
        alternativeMoves.push({
          san: 'Qxf8#',
          uci: 'f6f8',
          explanation: 'Мат ферзем!',
        });
      }
    }

    // Динамическая проверка на альтернативные легальные матующие ходы
    try {
      const cEngine = new Chess(fenBefore);
      const legals = cEngine.moves({ verbose: true });
      for (const lm of legals) {
        const testC = new Chess(fenBefore);
        testC.move(lm.san);
        if (testC.isCheckmate()) {
          const cleanAlt = lm.san.replace(/[!?+#\s]/g, '');
          const cleanCur = currentNode.san.replace(/[!?+#\s]/g, '');
          if (
            cleanAlt !== cleanCur &&
            !alternativeMoves.some((a) => a.san.replace(/[!?+#\s]/g, '') === cleanAlt)
          ) {
            alternativeMoves.push({
              san: lm.san,
              uci: `${lm.from}${lm.to}`,
              explanation: `Альтернативный победный мат (${lm.san})!`,
            });
          }
        }
      }
    } catch {
      // Безопасный фолбэк при анализе FEN
    }

    const moveNum = Math.floor(stepIndex + 1);

    steps.push({
      stepIndex,
      moveNumber: moveNum,
      fenBefore,
      expectedFenAfter,
      bestMoveSan: currentNode.san,
      bestMoveUci: currentNode.uci,
      bestMoveExplanation: currentNode.comment || 'Сильнейший атакующий ход по концепции Вуковича.',
      alternativeMoves: alternativeMoves.length > 0 ? alternativeMoves : undefined,
      blunders: blunders.length > 0 ? blunders : undefined,
      hints: {
        level1Concept:
          currentNode.comment?.split('.')[0] ||
          'Сконцентрируйте фигуры против ослабленного пункта королевского фланга.',
        level2Highlight: { fromSquare, toSquare },
        level3Arrow: [fromSquare, toSquare],
      },
      opponentResponse,
    });

    stepIndex++;
    if (!nextWhiteNode) {
      break;
    }
    currentNode = nextWhiteNode;
    currentWhiteSiblings = nextWhiteSiblings;
  }

  return steps.length > 0
    ? steps
    : [
        {
          stepIndex: 0,
          moveNumber: 1,
          fenBefore: study.initialFen,
          expectedFenAfter: study.rootNode.fen,
          bestMoveSan: study.rootNode.san,
          bestMoveUci: study.rootNode.uci,
          bestMoveExplanation: study.rootNode.comment || 'Начните форсированную атаку.',
          hints: {
            level1Concept: 'Найдите ключевую тактическую идею главы.',
            level2Highlight: {
              fromSquare: study.rootNode.uci.slice(0, 2),
              toSquare: study.rootNode.uci.slice(2, 4),
            },
            level3Arrow: [
              study.rootNode.uci.slice(0, 2),
              study.rootNode.uci.slice(2, 4),
            ],
          },
        },
      ];
}

/**
 * Интерактивный компонент глубокого расчета ходов на базе 8-состояний FSM
 */
export function CalculationTrainer({
  study,
  onSwitchToAnalysis,
  onNextStudy,
  className = '',
}: CalculationTrainerProps) {
  // Подготовка шагов расчета для этюда
  const steps = useMemo(() => getCalculationStepsForStudy(study), [study]);

  // FSM состояние
  const [fsmState, setFsmState] = useState<TrainerState>('WAITING_USER_MOVE');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [boardFen, setBoardFen] = useState<string>(steps[0]?.fenBefore || study.initialFen);

  // Ошибка и опровержение
  const [activeBlunder, setActiveBlunder] = useState<BlunderDetail | null>(null);
  const [isBlunderModalOpen, setIsBlunderModalOpen] = useState<boolean>(false);

  // Метрики и попытки
  const [stepAttempts, setStepAttempts] = useState<number[]>(() => steps.map(() => 0));
  const [highestHintLevelUsed, setHighestHintLevelUsed] = useState<number[]>(() => steps.map(() => 0));
  const [stepScores, setStepScores] = useState<StepScoreItem[]>([]);
  const [cleanDepthPlies, setCleanDepthPlies] = useState<number>(0);
  const [cleanRunBroken, setCleanRunBroken] = useState<boolean>(false);

  // Временные маркеры
  const [sessionStartTime] = useState<number>(() => Date.now());
  const [stepStartTime, setStepStartTime] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Превращение пешки
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  // Стрелки и подсветки
  const [customArrows, setCustomArrows] = useState<[Square, Square, string?][]>([]);
  const [customHighlights, setCustomHighlights] = useState<Record<string, React.CSSProperties>>({});

  // Таймер сессии
  useEffect(() => {
    if (fsmState === 'STUDY_COMPLETED' || fsmState === 'ANALYSIS_MODE') return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime, fsmState]);

  // Текущий шаг
  const currentStep = steps[currentStepIndex] || steps[0];
  const currentHintLevel = highestHintLevelUsed[currentStepIndex] || 0;

  // Запрос подсказки
  const handleRequestHint = useCallback(
    (level: 1 | 2 | 3) => {
      if (fsmState !== 'WAITING_USER_MOVE') return;

      setHighestHintLevelUsed((prev) => {
        const next = [...prev];
        if (level > (next[currentStepIndex] || 0)) {
          next[currentStepIndex] = level;
        }
        return next;
      });

      if (level >= 2) {
        setCleanRunBroken(true);
      }

      // Обновление стрелок и подсветки на доске
      if (level === 2 && currentStep.hints.level2Highlight) {
        const { fromSquare, toSquare } = currentStep.hints.level2Highlight;
        const styles: Record<string, React.CSSProperties> = {};
        if (fromSquare) {
          styles[fromSquare] = {
            boxShadow: 'inset 0 0 12px 3px rgba(245, 158, 11, 0.85)',
            backgroundColor: 'rgba(245, 158, 11, 0.25)',
          };
        }
        if (toSquare) {
          styles[toSquare] = {
            backgroundColor: 'rgba(251, 191, 36, 0.4)',
            boxShadow: '0 0 8px rgba(251, 191, 36, 0.6)',
          };
        }
        setCustomHighlights(styles);
      } else if (level === 3 && currentStep.hints.level3Arrow) {
        const [from, to] = currentStep.hints.level3Arrow;
        setCustomArrows([[from as Square, to as Square, 'rgba(34, 197, 94, 0.85)']]);
      }
    },
    [fsmState, currentStep, currentStepIndex]
  );

  // Сброс и перезапуск этюда
  const handleRestart = useCallback(() => {
    setCurrentStepIndex(0);
    setBoardFen(steps[0]?.fenBefore || study.initialFen);
    setFsmState('WAITING_USER_MOVE');
    setActiveBlunder(null);
    setIsBlunderModalOpen(false);
    setStepAttempts(steps.map(() => 0));
    setHighestHintLevelUsed(steps.map(() => 0));
    setStepScores([]);
    setCleanDepthPlies(0);
    setCleanRunBroken(false);
    setCustomArrows([]);
    setCustomHighlights({});
    setStepStartTime(Date.now());
  }, [steps, study.initialFen]);

  // Обработка успешного выполнения шага
  const handleStepSuccess = useCallback(
    (quality: 'best' | 'alternative', moveElapsedSec: number, actualFenAfter?: string) => {
      const attempts = (stepAttempts[currentStepIndex] || 0) + 1;
      const hintLvl = highestHintLevelUsed[currentStepIndex] || 0;

      // Обновление чистой глубины
      if (!cleanRunBroken && attempts === 1 && hintLvl < 2) {
        setCleanDepthPlies((prev) => prev + 2);
      } else {
        setCleanRunBroken(true);
      }

      // Расчет очков за шаг по формуле Вуковича
      const baseScore = 100;
      const qualityMultiplier = quality === 'best' ? 1.0 : 0.9;

      let hintMultiplier = 1.0;
      if (hintLvl === 1) hintMultiplier = 0.85;
      else if (hintLvl === 2) hintMultiplier = 0.6;
      else if (hintLvl === 3) hintMultiplier = 0.25;

      let attemptsMultiplier = 1.0;
      if (attempts === 2) attemptsMultiplier = 0.5;
      else if (attempts >= 3) attemptsMultiplier = 0.25;

      let timeMultiplier = 1.0;
      if (moveElapsedSec < 2.0) timeMultiplier = 0.95;
      else if (moveElapsedSec <= 35.0) timeMultiplier = 1.0;
      else if (moveElapsedSec <= 75.0) timeMultiplier = 0.9;
      else timeMultiplier = 0.75;

      const finalStepScore = Math.round(
        baseScore * qualityMultiplier * hintMultiplier * attemptsMultiplier * timeMultiplier
      );

      const scoreItem: StepScoreItem = {
        stepIndex: currentStepIndex,
        baseScore,
        qualityMultiplier,
        hintMultiplier,
        attemptsMultiplier,
        timeMultiplier,
        finalStepScore,
        elapsedSeconds: moveElapsedSec,
      };

      setStepScores((prev) => [...prev, scoreItem]);
      setBoardFen(actualFenAfter || currentStep.expectedFenAfter);
      setCustomArrows([]);
      setCustomHighlights({});

      const isLastStep = currentStepIndex + 1 >= steps.length;

      if (isLastStep) {
        // Завершение этюда
        setFsmState('STUDY_COMPLETED');

        // Сохранение прогресса в localStorage
        const allStepScores = [...stepScores, scoreItem];
        const avgScore = Math.round(
          allStepScores.reduce((acc, curr) => acc + curr.finalStepScore, 0) / allStepScores.length
        );
        const firstTrySteps = allStepScores.filter(
          (s) => s.attemptsMultiplier === 1.0 && s.hintMultiplier === 1.0
        ).length;
        const accuracy = Math.round((firstTrySteps / steps.length) * 100);

        saveStudyRecord({
          studyId: study.id,
          themeId: study.chapter,
          score: avgScore,
          accuracyPercent: accuracy,
          cleanDepth: cleanDepthPlies + (!cleanRunBroken ? 2 : 0),
        });
      } else {
        // Подготовка авто-ответа черных с задержкой 500мс
        setFsmState('ANIMATING_OPPONENT');
        setTimeout(() => {
          if (currentStep.opponentResponse) {
            setBoardFen(currentStep.opponentResponse.fenAfter);
            if (currentStep.opponentResponse.san.includes('x')) {
              playCaptureSound();
            } else {
              playMoveSound();
            }
          }
          setCurrentStepIndex((prev) => prev + 1);
          setFsmState('WAITING_USER_MOVE');
          setStepStartTime(Date.now());
        }, 500);
      }
    },
    [
      currentStepIndex,
      stepAttempts,
      highestHintLevelUsed,
      cleanRunBroken,
      currentStep,
      steps.length,
      stepScores,
      cleanDepthPlies,
      study.id,
      study.chapter,
    ]
  );

  // Возврат после ошибки (повтор текущего шага)
  const handleDismissBlunder = useCallback(() => {
    setBoardFen(currentStep.fenBefore);
    setActiveBlunder(null);
    setIsBlunderModalOpen(false);
    setCustomArrows([]);
    setCustomHighlights({});
    setFsmState('WAITING_USER_MOVE');
    setStepStartTime(Date.now());
  }, [currentStep.fenBefore]);

  // Проверка и исполнение хода пользователя
  const handleEvaluateMove = useCallback(
    (moveUci: string, moveSan: string): boolean => {
      if (fsmState !== 'WAITING_USER_MOVE') {
        return false;
      }

      setFsmState('EVALUATING_USER_MOVE');
      const moveElapsed = Math.max(0.5, (Date.now() - stepStartTime) / 1000);

      // Инкремент попытки шага
      setStepAttempts((prev) => {
        const next = [...prev];
        next[currentStepIndex] = (next[currentStepIndex] || 0) + 1;
        return next;
      });

      const cleanUci = moveUci.toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
      const cleanSan = moveSan.replace(/[!?+#\s]/g, '');

      // 1. Проверка на лучший ход (Best Move)
      const expectedCleanSan = currentStep.bestMoveSan.replace(/[!?+#\s]/g, '');
      const expectedCleanUci = currentStep.bestMoveUci.toLowerCase();

      const isBest =
        cleanSan === expectedCleanSan ||
        cleanUci === expectedCleanUci ||
        cleanUci.startsWith(expectedCleanUci);

      if (isBest) {
        if (moveSan.includes('x')) {
          playCaptureSound();
        } else {
          playMoveSound();
        }
        let resultingFen = currentStep.expectedFenAfter;
        try {
          const c = new Chess(boardFen || currentStep.fenBefore);
          const m = c.move(moveSan);
          if (m) resultingFen = c.fen();
        } catch {}
        handleStepSuccess('best', moveElapsed, resultingFen);
        return true;
      }

      // 2. Проверка альтернативных допустимых ходов
      const matchedAlt = currentStep.alternativeMoves?.find((alt) => {
        const altSan = alt.san.replace(/[!?+#\s]/g, '');
        return cleanSan === altSan || cleanUci === alt.uci;
      });

      if (matchedAlt) {
        if (moveSan.includes('x')) {
          playCaptureSound();
        } else {
          playMoveSound();
        }
        let resultingFen = currentStep.expectedFenAfter;
        try {
          const c = new Chess(boardFen || currentStep.fenBefore);
          const m = c.move(moveSan);
          if (m) resultingFen = c.fen();
        } catch {}
        handleStepSuccess('alternative', moveElapsed, resultingFen);
        return true;
      }

      // 2.1. Любой легальный ход белых, ставящий мат королю соперника,
      // завершает атаку победой
      try {
        const chessEngine = new Chess(boardFen || currentStep.fenBefore);
        const testMove = chessEngine.move(moveSan);
        if (testMove && chessEngine.isCheckmate()) {
          if (moveSan.includes('x')) {
            playCaptureSound();
          } else {
            playMoveSound();
          }
          handleStepSuccess('alternative', moveElapsed, chessEngine.fen());
          return true;
        }
      } catch {
        // нелегальный ход
      }

      // 3. Ход является ошибкой (Blunder) или ложным следом
      setCleanRunBroken(true);

      const matchedBlunder = currentStep.blunders?.find((b) => {
        const bSan = b.san.replace(/[!?+#\s]/g, '');
        return cleanSan === bSan || cleanUci === b.uci;
      });

      if (matchedBlunder) {
        // Физическое исполнение опровержения на доске
        setBoardFen(matchedBlunder.refutationFen);
        if (matchedBlunder.refutationSan.includes('x')) {
          playCaptureSound();
        } else {
          playMoveSound();
        }

        const fromSq = matchedBlunder.refutationUci.slice(0, 2) as Square;
        const toSq = matchedBlunder.refutationUci.slice(2, 4) as Square;

        const blunderDetail: BlunderDetail = {
          attemptedSan: matchedBlunder.san,
          punishmentSan: matchedBlunder.refutationSan,
          punishmentFen: matchedBlunder.refutationFen,
          explanation: matchedBlunder.explanation,
          arrows: [[fromSq, toSq, 'rgba(239, 68, 68, 0.9)']],
          highlights: {
            [toSq]: {
              backgroundColor: 'rgba(239, 68, 68, 0.75)',
              boxShadow: '0 0 12px rgba(239, 68, 68, 0.9)',
            },
          },
        };

        setActiveBlunder(blunderDetail);
        setCustomArrows([[fromSq, toSq, 'rgba(239, 68, 68, 0.9)']]);
        setCustomHighlights({
          [toSq]: {
            backgroundColor: 'rgba(239, 68, 68, 0.75)',
            boxShadow: '0 0 12px rgba(239, 68, 68, 0.9)',
          },
        });

        setFsmState('MISTAKE_EXPLANATION');
        setIsBlunderModalOpen(true);
        return true;
      }

      // Неожиданный неверный ход
      const defaultBlunder: BlunderDetail = {
        attemptedSan: moveSan,
        punishmentSan: '??',
        punishmentFen: currentStep.fenBefore,
        explanation:
          'Ход не соответствует форсированной линии Вуковича. Белые теряют темп и инициативу в атаке.',
        arrows: [],
        highlights: {},
      };

      setActiveBlunder(defaultBlunder);
      setFsmState('MISTAKE_EXPLANATION');
      setIsBlunderModalOpen(true);
      return true;
    },
    [fsmState, stepStartTime, currentStep, currentStepIndex, handleStepSuccess, boardFen]
  );

  // Обработка Drag & Drop
  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece: string): boolean => {
      if (fsmState !== 'WAITING_USER_MOVE') {
        return false;
      }

      // Проверка на превращение пешки
      const isWhitePawn = piece === 'wP';
      const isPromotionRank = targetSquare[1] === '8';
      if (isWhitePawn && sourceSquare[1] === '7' && isPromotionRank) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        return false;
      }

      const chess = new Chess(boardFen);
      try {
        const move = chess.move({ from: sourceSquare, to: targetSquare });
        if (!move) return false;
        const uci = `${sourceSquare}${targetSquare}`;
        return handleEvaluateMove(uci, move.san);
      } catch {
        return false;
      }
    },
    [fsmState, boardFen, handleEvaluateMove]
  );

  // Подтверждение превращения пешки
  const handleConfirmPromotion = useCallback(
    (promotionPiece: 'q' | 'r' | 'b' | 'n') => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      const chess = new Chess(boardFen);

      try {
        const move = chess.move({ from, to, promotion: promotionPiece });
        if (move) {
          const uci = `${from}${to}${promotionPiece}`;
          handleEvaluateMove(uci, move.san);
        }
      } catch {
        // Illegal move
      }
      setPendingPromotion(null);
    },
    [pendingPromotion, boardFen, handleEvaluateMove]
  );

  // Расчет итоговой сводки сессии
  const sessionSummary: CalculationSessionSummary = useMemo(() => {
    const totalScore =
      stepScores.length > 0
        ? Math.round(stepScores.reduce((acc, s) => acc + s.finalStepScore, 0) / stepScores.length)
        : 0;

    const firstTryNoHintSteps = stepScores.filter(
      (s) => s.attemptsMultiplier === 1.0 && s.hintMultiplier === 1.0
    ).length;

    const accuracyPercent =
      steps.length > 0 ? Math.round((firstTryNoHintSteps / steps.length) * 100) : 0;

    let rankTitleRu = 'Рекомендуется разбор';
    if (totalScore >= 92) rankTitleRu = 'Гроссмейстер атаки Вуковича';
    else if (totalScore >= 78) rankTitleRu = 'Мастер форсированного расчета';
    else if (totalScore >= 60) rankTitleRu = 'Кандидат в мастера';
    else if (totalScore >= 40) rankTitleRu = 'Практик атаки';

    let stars = 1;
    if (totalScore >= 85 && accuracyPercent >= 80) stars = 3;
    else if (totalScore >= 60 && accuracyPercent >= 50) stars = 2;

    return {
      totalScore,
      accuracyPercent,
      cleanDepthPlies,
      rankTitleRu,
      stars,
      elapsedSeconds,
      stepScores,
    };
  }, [stepScores, steps.length, cleanDepthPlies, elapsedSeconds]);

  const isBoardLocked =
    fsmState === 'EVALUATING_USER_MOVE' ||
    fsmState === 'ANIMATING_OPPONENT' ||
    fsmState === 'MISTAKE_EXPLANATION' ||
    fsmState === 'STUDY_COMPLETED';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Верхний информационный HUD тренажера */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Глубокий расчет • Ход {currentStepIndex + 1} из {steps.length}
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Белые начинают и проводят атаку</span>
              {fsmState === 'ANIMATING_OPPONENT' && (
                <span className="text-xs font-normal text-amber-400 animate-pulse">
                  (Черные отвечают...)
                </span>
              )}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Таймер расчета */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono font-bold">
              {Math.floor(elapsedSeconds / 60)}:
              {String(elapsedSeconds % 60).padStart(2, '0')}
            </span>
          </div>

          {/* Чистая глубина */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>Чисто: </span>
            <span className="font-mono font-bold text-blue-300">{cleanDepthPlies} plies</span>
          </div>
        </div>
      </div>

      {/* 2. Основная рабочая область: Доска слева, Панель расчета/подсказок справа */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Шахматная доска */}
        <div className="lg:col-span-6 xl:col-span-6 flex flex-col items-center lg:items-start gap-4">
          <div className="w-full flex justify-center bg-slate-900/60 border border-slate-800 rounded-2xl p-3 sm:p-5 shadow-2xl backdrop-blur relative">
            <ChessboardWrapper
              position={boardFen}
              orientation={study.orientation || 'white'}
              customArrows={customArrows}
              customSquareStyles={customHighlights}
              onPieceDrop={handlePieceDrop}
              autoResize={true}
              arePiecesDraggable={!isBoardLocked}
              isInteractive={!isBoardLocked}
            />

            {/* Оверлей блокировки доски при ответе соперника */}
            {fsmState === 'ANIMATING_OPPONENT' && (
              <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] rounded-2xl pointer-events-none flex items-center justify-center">
                <span className="px-3 py-1.5 rounded-xl bg-slate-900/90 text-amber-300 text-xs font-semibold shadow-lg border border-amber-500/40">
                  Ход черных...
                </span>
              </div>
            )}
          </div>

          {/* Кнопка сброса */}
          <div className="w-full flex justify-between items-center text-xs text-slate-400 px-1">
            <button
              type="button"
              onClick={handleRestart}
              className="hover:text-amber-400 transition-colors underline"
            >
              Начать этюд сначала
            </button>
            <span>Вукович: 1800-2200</span>
          </div>
        </div>

        {/* Правая колонка: Подсказки или Финальная карточка */}
        <div className="lg:col-span-6 xl:col-span-6 flex flex-col gap-4">
          {fsmState === 'STUDY_COMPLETED' ? (
            <CalculationScoreCard
              summary={sessionSummary}
              studyTitle={study.title}
              onRetry={handleRestart}
              onNextStudy={onNextStudy}
              onAnalysisMode={onSwitchToAnalysis}
            />
          ) : (
            <>
              {/* Карточка текущей задачи (Fog of War) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Инструкция по расчету
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Ход #{currentStep.moveNumber}
                  </span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  Рассчитайте продолжение атаки в уме. Не спешите делать очевидный ход — черные готовы
                  дать упорный отпор на 3–7 ходов вперед.
                </p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>Попыток на этом шаге:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {(stepAttempts[currentStepIndex] || 0) + 1}
                  </span>
                </div>
              </div>

              {/* 3-уровневая панель подсказок */}
              <HintPanel
                currentHintLevel={currentHintLevel}
                hints={currentStep.hints}
                onRequestHint={handleRequestHint}
                disabled={isBoardLocked}
              />

              {/* Кнопка перехода в режим анализа */}
              <button
                type="button"
                onClick={onSwitchToAnalysis}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 transition-all text-xs font-medium"
              >
                <BookOpen className="w-4 h-4 text-slate-400" />
                <span>Открыть режим изучения и анализа (свободный разбор)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Модальное окно ошибки и опровержения */}
      <BlunderModal
        isOpen={isBlunderModalOpen}
        blunder={activeBlunder}
        onRetry={handleDismissBlunder}
      />

      {/* Модальное окно превращения пешки */}
      <PromotionModal
        isOpen={Boolean(pendingPromotion)}
        color="w"
        onSelectPiece={handleConfirmPromotion}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}

export default CalculationTrainer;
