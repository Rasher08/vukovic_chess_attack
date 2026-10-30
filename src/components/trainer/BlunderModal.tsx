'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw, BookOpen, ShieldAlert, ArrowRight } from 'lucide-react';
import { BlunderDetail } from '@/types/trainer';

export interface BlunderModalProps {
  isOpen: boolean;
  blunder: BlunderDetail | null;
  onRetry: () => void;
  className?: string;
}

/**
 * Модальное окно тактического разбора ошибки и опровержения черных (Вукович)
 */
export function BlunderModal({
  isOpen,
  blunder,
  onRetry,
  className = '',
}: BlunderModalProps) {
  // Обработка клавиш Escape и Enter для быстрого возврата к расчету
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onRetry();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onRetry]);

  if (!isOpen || !blunder) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="blunder-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        className={`w-full max-w-lg bg-slate-900 border border-rose-600/50 rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-7 space-y-4 sm:space-y-5 text-slate-100 overflow-y-auto max-h-[92vh] relative my-auto ${className}`}
      >
        {/* Верхняя светящаяся полоса ошибки */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

        {/* Заголовок */}
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex-shrink-0 animate-pulse">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/60">
              <AlertTriangle className="w-3 h-3" />
              <span>Ложный след / Тактическая ошибка</span>
            </div>
            <h2
              id="blunder-modal-title"
              className="text-lg sm:text-xl font-extrabold text-slate-100 tracking-tight"
            >
              Почему ход {blunder.attemptedSan}? ошибочен
            </h2>
          </div>
        </div>

        {/* Сравнение: Ход игрока -> Карающий ответ черных */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
              Ваш ход (ошибка)
            </span>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-rose-950/80 text-rose-300 border border-rose-800/60 font-mono font-bold text-sm sm:text-base">
                {blunder.attemptedSan}?
              </span>
            </div>
          </div>

          <div className="space-y-1 border-l border-slate-800 pl-3">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
              Опровержение черных
            </span>
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-slate-600 hidden sm:block" />
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-mono font-bold text-sm sm:text-base">
                {blunder.punishmentSan}!
              </span>
            </div>
          </div>
        </div>

        {/* Педагогическое объяснение Вуковича */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Урок Владимира Вуковича:</span>
          </div>
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 text-sm text-slate-300 leading-relaxed max-h-56 overflow-y-auto">
            {blunder.explanation}
          </div>
        </div>

        {/* Кнопка возврата к расчету */}
        <div className="pt-2">
          <button
            type="button"
            autoFocus
            onClick={onRetry}
            className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm sm:text-base shadow-lg hover:shadow-amber-500/25 transition-all active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Попробовать снова (вернуться к расчету)</span>
          </button>
          <p className="text-center text-[11px] text-slate-500 mt-2">
            Нажмите <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">Enter</kbd> или кликните кнопку для возврата
          </p>
        </div>
      </div>
    </div>
  );
}

export default BlunderModal;
