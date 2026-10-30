'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Square } from 'chess.js';
import {
  getActiveColor,
  getPieceAtSquare,
  getLegalTargetSquares,
  isPromotion,
  isCaptureSquare,
  getSquareHighlightStyles,
  isCheck,
} from '@/lib/chessUtils';
import {
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playErrorSound,
} from '@/lib/audioSynth';
import { PromotionModal, PromotionPiece } from './PromotionModal';
import { useHudBoard } from './HudBridgeControl';

export interface ChessboardWrapperProps {
  /**
   * Текущая позиция в нотации FEN
   */
  position: string;
  /** Suppress the local HUD when the owner knows the game ended (including repetition). */
  hudGameOver?: boolean;
  /**
   * Ориентация доски ('white' - белые снизу, 'black' - черные снизу)
   */
  orientation?: 'white' | 'black';
  /**
   * Разрешено ли перетаскивание фигур мышью
   */
  arePiecesDraggable?: boolean;
  /**
   * Коллбэк при завершении хода перетаскиванием (drag-and-drop)
   */
  onPieceDrop?: (sourceSquare: Square, targetSquare: Square, piece: string) => boolean;
  /**
   * Коллбэк при клике на поле
   */
  onSquareClick?: (square: Square) => void;
  /**
   * Массив графических стрелок [Square, Square, color?]
   */
  customArrows?: [Square, Square, string?][];
  /**
   * Пользовательские стили полей доски
   */
  customSquareStyles?: Record<string, React.CSSProperties>;
  /**
   * Фиксированная ширина доски в пикселях (если autoResize = false)
   */
  boardWidth?: number;
  /**
   * Автоматическое масштабирование под ширину родительского контейнера
   */
  autoResize?: boolean;
  /**
   * Разрешено ли интерактивное взаимодействие (клики и перетаскивание)
   */
  isInteractive?: boolean;
  /**
   * Показывать ли точки легальных ходов и круги взятия
   */
  showLegalMoves?: boolean;
  /**
   * Воспроизводить ли звуковые эффекты при ходах
   */
  playSoundEffects?: boolean;
  /**
   * Подсветка последнего хода (откуда и куда)
   */
  lastMove?: { from: Square; to: Square } | null;
  /**
   * Альтернативный обобщенный обработчик хода
   */
  onMove?: (from: Square, to: Square, promotion?: string) => boolean;
  /**
   * Дополнительные CSS классы контейнера доски
   */
  className?: string;
}

/**
 * Интерактивная шахматная доска для платформы Вуковича.
 * 
 * Особенности:
 * 1. SSR hydration safety: защита от расхождений сервера и клиента ('use client' + isMounted).
 * 2. Двойной ввод: поддержка как Drag & Drop, так и Click-to-Move (двумя кликами).
 * 3. Индикаторы ходов: изумрудные точки для свободных полей, прицельные кольца для взятий.
 * 4. Семантические стрелки угроз, маневров и жертв (палитра Вуковича).
 * 5. Подсветка шаха королю и полей последнего совершенного хода.
 * 6. Модальное окно превращения пешки на русском языке.
 * 7. Адаптивный ресайз через ResizeObserver.
 */
export function ChessboardWrapper({
  position,
  hudGameOver = false,
  orientation = 'white',
  arePiecesDraggable = true,
  onPieceDrop,
  onSquareClick,
  customArrows = [],
  customSquareStyles = {},
  boardWidth,
  autoResize = true,
  isInteractive = true,
  showLegalMoves = true,
  playSoundEffects = true,
  lastMove = null,
  onMove,
  className = '',
}: ChessboardWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [currentWidth, setCurrentWidth] = useState<number>(boardWidth || 480);
  const [hudDragging, setHudDragging] = useState(false);

  // Состояние выбранного поля для режима Click-to-Move
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  // Состояние превращения пешки (открывает модалку PromotionModal)
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
    piece: string;
  } | null>(null);

  useHudBoard(position, orientation, hudGameOver || !isMounted || hudDragging || pendingPromotion !== null, containerRef);

  // Локальное отслеживание последнего хода для подсветки
  const [internalLastMove, setInternalLastMove] = useState<{ from: Square; to: Square } | null>(
    lastMove
  );

  // 1. Инициализация монтирования (SSR Safety)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Сброс выбранного поля при смене FEN извне
  useEffect(() => {
    setSelectedSquare(null);
  }, [position]);

  // 3. Синхронизация последнего хода из пропсов
  useEffect(() => {
    if (lastMove !== undefined) {
      setInternalLastMove(lastMove);
    }
  }, [lastMove]);

  // 4. Динамическое авто-масштабирование ширины доски
  useEffect(() => {
    if (!autoResize) {
      if (boardWidth) setCurrentWidth(boardWidth);
      return;
    }

    function updateDimensions() {
      if (containerRef.current) {
        const clientWidth = containerRef.current.clientWidth;
        if (clientWidth > 0) {
          // Ограничиваем максимальную ширину 540px для идеального баланса со списком ходов
          // Вычитаем запас на рамку доски (8px) и поддерживаем узкие экраны до 320px
          const maxAllowed = boardWidth || 640;
          const calculated = Math.min(clientWidth - 8, maxAllowed);
          setCurrentWidth(calculated >= 220 ? calculated : Math.max(clientWidth - 8, 200));
        }
      }
    }

    updateDimensions();

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateDimensions())
        : null;

    if (containerRef.current && observer) {
      observer.observe(containerRef.current);
    }

    window.addEventListener('resize', updateDimensions);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [autoResize, boardWidth]);

  // Звуковое оповещение о шахе, если позиция сменилась на шах
  useEffect(() => {
    if (playSoundEffects && isMounted && isCheck(position)) {
      playCheckSound();
    }
  }, [position, playSoundEffects, isMounted]);

  // Вычисление всех стилей полей (точки, подсветка выбранного, шах, последний ход)
  const computedSquareStyles = useMemo(() => {
    return getSquareHighlightStyles({
      fen: position,
      selectedSquare: showLegalMoves ? selectedSquare : null,
      lastMove: internalLastMove,
      customSquareStyles,
    });
  }, [position, selectedSquare, showLegalMoves, internalLastMove, customSquareStyles]);

  // Обработка клика по полю (Click-to-Move)
  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!isInteractive) {
        onSquareClick?.(square);
        return;
      }

      const activeColor = getActiveColor(position);
      const pieceOnSquare = getPieceAtSquare(position, square);

      // Шаг 1: Если фигура еще не выбрана
      if (!selectedSquare) {
        // Выбираем фигуру, только если она принадлежит активному игроку
        if (pieceOnSquare && pieceOnSquare.color === activeColor) {
          setSelectedSquare(square);
        }
        onSquareClick?.(square);
        return;
      }

      // Шаг 2: Если поле уже выбрано ранее
      // Клик по тому же самому полю снимает выбор
      if (selectedSquare === square) {
        setSelectedSquare(null);
        onSquareClick?.(square);
        return;
      }

      // Клик по другой своей фигуре переключает выбор на нее
      if (pieceOnSquare && pieceOnSquare.color === activeColor) {
        setSelectedSquare(square);
        onSquareClick?.(square);
        return;
      }

      // Проверяем, является ли кликнутое поле легальной целью для хода
      const legalTargets = getLegalTargetSquares(position, selectedSquare);
      if (legalTargets.includes(square)) {
        // Проверяем, нужно ли превращение пешки
        if (isPromotion(position, selectedSquare, square)) {
          setPendingPromotion({
            from: selectedSquare,
            to: square,
            piece: 'p',
          });
          onSquareClick?.(square);
          return;
        }

        // Обычный легальный ход без превращения
        const isCapture = isCaptureSquare(position, selectedSquare, square);
        const movingPiece = getPieceAtSquare(position, selectedSquare);
        const pieceCode = movingPiece ? `${movingPiece.color}${movingPiece.type.toUpperCase()}` : 'wP';

        let moveSuccessful = true;
        if (onPieceDrop) {
          moveSuccessful = onPieceDrop(selectedSquare, square, pieceCode);
        } else if (onMove) {
          moveSuccessful = onMove(selectedSquare, square);
        }

        if (moveSuccessful !== false) {
          setInternalLastMove({ from: selectedSquare, to: square });
          if (playSoundEffects) {
            if (isCapture) {
              playCaptureSound();
            } else {
              playMoveSound();
            }
          }
        }

        setSelectedSquare(null);
        onSquareClick?.(square);
        return;
      }

      // Клик по нелегальному полю сбрасывает выбор
      setSelectedSquare(null);
      onSquareClick?.(square);
    },
    [
      isInteractive,
      position,
      selectedSquare,
      onPieceDrop,
      onMove,
      onSquareClick,
      playSoundEffects,
    ]
  );

  // Обработка завершения перетаскивания фигуры (Drag & Drop)
  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece: string): boolean => {
      if (!isInteractive || !arePiecesDraggable) {
        return false;
      }

      // Проверка легальности хода
      const legalTargets = getLegalTargetSquares(position, sourceSquare);
      if (!legalTargets.includes(targetSquare)) {
        if (playSoundEffects) {
          playErrorSound();
        }
        return false;
      }

      // Проверка на превращение пешки
      if (isPromotion(position, sourceSquare, targetSquare)) {
        setPendingPromotion({
          from: sourceSquare,
          to: targetSquare,
          piece,
        });
        // Возвращаем false, чтобы фигура вернулась на место до выбора в модалке
        return false;
      }

      // Выполнение легального хода
      const isCapture = isCaptureSquare(position, sourceSquare, targetSquare);
      let dropSuccess = true;

      if (onPieceDrop) {
        dropSuccess = onPieceDrop(sourceSquare, targetSquare, piece);
      } else if (onMove) {
        dropSuccess = onMove(sourceSquare, targetSquare);
      }

      if (dropSuccess !== false) {
        setSelectedSquare(null);
        setInternalLastMove({ from: sourceSquare, to: targetSquare });

        if (playSoundEffects) {
          if (isCapture) {
            playCaptureSound();
          } else {
            playMoveSound();
          }
        }
        return true;
      }

      return false;
    },
    [
      isInteractive,
      arePiecesDraggable,
      position,
      onPieceDrop,
      onMove,
      playSoundEffects,
    ]
  );

  // Подтверждение выбора фигуры в модальном окне превращения
  const handleConfirmPromotion = useCallback(
    (chosenPiece: PromotionPiece) => {
      if (!pendingPromotion) return;

      const { from, to } = pendingPromotion;
      const isCapture = isCaptureSquare(position, from, to);

      setPendingPromotion(null);
      setSelectedSquare(null);

      let success = true;
      if (onPieceDrop) {
        success = onPieceDrop(from, to, chosenPiece);
      } else if (onMove) {
        success = onMove(from, to, chosenPiece);
      }

      if (success !== false) {
        setInternalLastMove({ from, to });
        if (playSoundEffects) {
          if (isCapture) {
            playCaptureSound();
          } else {
            playMoveSound();
          }
        }
      }
    },
    [pendingPromotion, position, onPieceDrop, onMove, playSoundEffects]
  );

  // Отмена превращения
  const handleCancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    setSelectedSquare(null);
  }, []);

  // Цветовая палитра классической соревновательной доски (Wood / Green)
  const customBoardStyle = useMemo(
    () => ({
      borderRadius: '0',
      boxShadow: 'none',
      border: '1px solid var(--board-border)',
      boxSizing: 'border-box' as const,
    }),
    []
  );

  const customDarkSquareStyle = useMemo(
    () => ({
      backgroundColor: 'var(--board-dark)', // Турнирный оливково-зеленый
    }),
    []
  );

  const customLightSquareStyle = useMemo(
    () => ({
      backgroundColor: 'var(--board-light)', // Теплый кремовый
    }),
    []
  );

  // Плейсхолдер до гидратации на клиенте
  if (!isMounted) {
    return (
      <div
        ref={containerRef}
        className={`w-full aspect-square max-w-[640px] bg-[var(--soft)] border border-[var(--line)] flex flex-col items-center justify-center text-[var(--muted)] font-medium ${className}`}
      >
        <span className="text-3xl mb-2" aria-hidden="true">♟</span>
        <span className="text-sm">Загрузка шахматной доски...</span>
      </div>
    );
  }

  const activeColor = getActiveColor(position);

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-[640px] flex flex-col items-center justify-center select-none touch-none ${className}`}
    >
      <Chessboard
        position={position}
        boardWidth={currentWidth}
        boardOrientation={orientation}
        arePiecesDraggable={isInteractive && arePiecesDraggable}
        onPieceDrop={handlePieceDrop}
        onPieceDragBegin={() => setHudDragging(true)}
        onPieceDragEnd={() => setHudDragging(false)}
        onSquareClick={(square) => handleSquareClick(square as Square)}
        customArrows={customArrows}
        customSquareStyles={computedSquareStyles}
        customBoardStyle={customBoardStyle}
        customDarkSquareStyle={customDarkSquareStyle}
        customLightSquareStyle={customLightSquareStyle}
        animationDuration={220}
        showPromotionDialog={false}
      />

      {/* Модальное окно превращения пешки на русском языке */}
      <PromotionModal
        isOpen={pendingPromotion !== null}
        color={activeColor}
        onSelectPiece={handleConfirmPromotion}
        onCancel={handleCancelPromotion}
      />
    </div>
  );
}

export default ChessboardWrapper;
