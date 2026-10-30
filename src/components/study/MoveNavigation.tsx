'use client';

import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  ArrowUpDown,
  Keyboard,
} from 'lucide-react';

export interface MoveNavigationProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onFirstMove: () => void;
  onPreviousMove: () => void;
  onNextMove: () => void;
  onLastMove: () => void;
  onFlipBoard: () => void;
  onReset: () => void;
  orientation: 'white' | 'black';
  className?: string;
}

export function MoveNavigation({
  canGoBack,
  canGoForward,
  onFirstMove,
  onPreviousMove,
  onNextMove,
  onLastMove,
  onFlipBoard,
  onReset,
  orientation,
  className = '',
}: MoveNavigationProps) {
  return (
    <div
      className={`w-full max-w-[540px] flex flex-col gap-2 p-3 bg-slate-900/90 border border-slate-800 rounded-xl shadow-lg backdrop-blur select-none ${className}`}
      role="toolbar"
      aria-label="Навигация по ходам партии"
    >
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {/* Кнопки перемещения по ходам */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* В самый первый ход (|<) */}
          <button
            type="button"
            onClick={onFirstMove}
            disabled={!canGoBack}
            className="flex items-center justify-center p-2 min-w-[42px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-all active:scale-95"
            title="К первому ходу (Home)"
            aria-label="К первому ходу"
          >
            <ChevronsLeft className="w-4 h-4 sm:w-4 sm:h-4" />
          </button>

          {/* Предыдущий ход (<) */}
          <button
            type="button"
            onClick={onPreviousMove}
            disabled={!canGoBack}
            className="flex items-center justify-center p-2 min-w-[42px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-all active:scale-95"
            title="Предыдущий ход (Стрелка влево)"
            aria-label="Предыдущий ход"
          >
            <ChevronLeft className="w-4 h-4 sm:w-4 sm:h-4" />
          </button>

          {/* Следующий ход (>) */}
          <button
            type="button"
            onClick={onNextMove}
            disabled={!canGoForward}
            className="flex items-center justify-center p-2 min-w-[42px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-all active:scale-95"
            title="Следующий ход (Стрелка вправо)"
            aria-label="Следующий ход"
          >
            <ChevronRight className="w-4 h-4 sm:w-4 sm:h-4" />
          </button>

          {/* В самый последний ход (>|) */}
          <button
            type="button"
            onClick={onLastMove}
            disabled={!canGoForward}
            className="flex items-center justify-center p-2 min-w-[42px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-all active:scale-95"
            title="В конец варианта (End)"
            aria-label="В конец варианта"
          >
            <ChevronsRight className="w-4 h-4 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Разделитель */}
        <div className="h-6 w-px bg-slate-800 mx-0.5 sm:mx-1" />

        {/* Кнопки управления доской: Сброс и Переворот */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Сброс */}
          <button
            type="button"
            onClick={onReset}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[38px] rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95 text-xs font-medium border border-slate-700/60"
            title="Сбросить доску к началу позиции"
            aria-label="Сбросить доску"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Сброс</span>
          </button>

          {/* Переворот доски */}
          <button
            type="button"
            onClick={onFlipBoard}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[38px] rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95 text-xs font-medium border border-slate-700/60"
            title={`Повернуть доску (сейчас: ${orientation === 'white' ? 'Белые снизу' : 'Черные снизу'})`}
            aria-label="Повернуть доску"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">
              {orientation === 'white' ? 'Белые' : 'Черные'}
            </span>
          </button>
        </div>
      </div>

      {/* Подсказка горячих клавиш */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1 border-t border-slate-800/60">
        <div className="flex items-center gap-1">
          <Keyboard className="w-3 h-3 text-slate-400" />
          <span>Навигация:</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span>← / → ход</span>
          <span>↑ / ↓ вариант</span>
          <span>Home / End</span>
        </div>
      </div>
    </div>
  );
}

export default MoveNavigation;
