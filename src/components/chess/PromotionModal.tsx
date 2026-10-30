'use client';

import React, { useEffect } from 'react';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface PromotionModalProps {
  isOpen: boolean;
  color?: 'white' | 'black' | 'w' | 'b';
  onSelectPiece: (piece: PromotionPiece) => void;
  onCancel?: () => void;
}

interface PieceChoice {
  piece: PromotionPiece;
  name: string;
  whiteSymbol: string;
  blackSymbol: string;
  shortcut: string;
  description: string;
}

const PROMOTION_CHOICES: PieceChoice[] = [
  {
    piece: 'q',
    name: 'Ферзь',
    whiteSymbol: '♕',
    blackSymbol: '♛',
    shortcut: '1',
    description: 'Сильнейшая атакующая фигура',
  },
  {
    piece: 'r',
    name: 'Ладья',
    whiteSymbol: '♖',
    blackSymbol: '♜',
    shortcut: '2',
    description: 'Линейная тяжелая фигура',
  },
  {
    piece: 'b',
    name: 'Слон',
    whiteSymbol: '♗',
    blackSymbol: '♝',
    shortcut: '3',
    description: 'Дальнобойная легкая фигура',
  },
  {
    piece: 'n',
    name: 'Конь',
    whiteSymbol: '♘',
    blackSymbol: '♞',
    shortcut: '4',
    description: 'Маневренная легкая фигура',
  },
];

/**
 * Всплывающее модальное окно превращения пешки на русском языке
 * Позволяет игроку выбрать Ферзя, Ладью, Слона или Коня с помощью мыши или горячих клавиш.
 */
export function PromotionModal({
  isOpen,
  color = 'white',
  onSelectPiece,
  onCancel,
}: PromotionModalProps) {
  const isWhite = color === 'white' || color === 'w';

  // Обработка горячих клавиш клавиатуры для мгновенного превращения
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (key === '1' || key === 'q') {
        e.preventDefault();
        onSelectPiece('q');
      } else if (key === '2' || key === 'r') {
        e.preventDefault();
        onSelectPiece('r');
      } else if (key === '3' || key === 'b') {
        e.preventDefault();
        onSelectPiece('b');
      } else if (key === '4' || key === 'n' || key === 'k') {
        e.preventDefault();
        onSelectPiece('n');
      } else if (key === 'escape' && onCancel) {
        e.preventDefault();
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onSelectPiece, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-modal-title"
    >
      <div className="w-full max-w-md chess-promotion border rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col items-center overflow-y-auto max-h-[92vh] my-auto">
        {/* Заголовок */}
        <h3
          id="promotion-modal-title"
          className="text-lg sm:text-xl font-bold tracking-tight chess-promotion-heading flex items-center gap-2 mb-1"
        >
          <span>♟️</span>
          <span>Превращение пешки</span>
        </h3>
        <p className="text-xs sm:text-sm chess-promotion-muted text-center mb-4 sm:mb-5">
          Пешка достигла последней горизонтали. Выберите фигуру:
        </p>

        {/* Сетка вариантов превращения */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full mb-4 sm:mb-5">
          {PROMOTION_CHOICES.map((choice) => (
            <button
              key={choice.piece}
              type="button"
              onClick={() => onSelectPiece(choice.piece)}
              className="chess-promotion-choice group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border transition-all duration-150 cursor-pointer min-h-[80px] sm:min-h-[90px]"
              title={`${choice.name} (${choice.shortcut})`}
            >
              <span className="text-3xl sm:text-4xl filter drop-shadow select-none group-hover:scale-110 transition-transform">
                {isWhite ? choice.whiteSymbol : choice.blackSymbol}
              </span>
              <span className="mt-1 font-semibold text-xs sm:text-sm ">
                {choice.name}
              </span>
              <span className="text-[10px] sm:text-[11px] chess-promotion-muted text-center leading-tight mt-0.5">
                {choice.description}
              </span>
              <span className="mt-1 text-[9px] sm:text-[10px] px-1.5 py-0.5 chess-promotion-muted rounded">
                Клавиша {choice.shortcut}
              </span>
            </button>
          ))}
        </div>

        {/* Кнопка отмены (если доступна) */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs chess-promotion-muted transition-colors py-2 px-4 rounded chess-promotion-cancel min-h-[38px] flex items-center justify-center"
          >
            Отмена (Esc)
          </button>
        )}
      </div>
    </div>
  );
}

export default PromotionModal;
