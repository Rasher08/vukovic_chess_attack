'use client';

import React from 'react';
import { Lightbulb, Eye, Navigation, AlertCircle, HelpCircle } from 'lucide-react';

export interface HintSpec {
  level1Concept: string;
  level2Highlight?: { fromSquare?: string; toSquare?: string };
  level3Arrow?: [string, string];
  bestMoveSan?: string;
}

export interface HintPanelProps {
  currentHintLevel: number; // 0, 1, 2, 3
  hints: HintSpec;
  onRequestHint: (level: 1 | 2 | 3) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Панель 3-уровневых прогрессивных подсказок Вуковича со штрафными коэффициентами
 */
export function HintPanel({
  currentHintLevel,
  hints,
  onRequestHint,
  disabled = false,
  className = '',
}: HintPanelProps) {
  return (
    <div className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 ${className}`}>
      {/* Заголовок панели */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
            <Lightbulb className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Подсказки Вуковича
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
          <span>Лестница подсказок</span>
        </div>
      </div>

      {/* Кнопки вызова 3 уровней подсказок */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Уровень 1 */}
        <button
          type="button"
          disabled={disabled || currentHintLevel >= 1}
          onClick={() => onRequestHint(1)}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            currentHintLevel >= 1
              ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
              : disabled
              ? 'bg-slate-950/40 border-slate-800/60 text-slate-600 cursor-not-allowed'
              : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 hover:border-amber-500/40 text-slate-300 active:scale-95'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              Уровень 1
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/40">
              -15%
            </span>
          </div>
          <span className="text-xs font-medium text-slate-200">Концепция</span>
          <span className="text-[10px] text-slate-400 mt-0.5">Идея Вуковича</span>
        </button>

        {/* Уровень 2 */}
        <button
          type="button"
          disabled={disabled || currentHintLevel < 1 || currentHintLevel >= 2}
          onClick={() => onRequestHint(2)}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            currentHintLevel >= 2
              ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
              : currentHintLevel < 1 || disabled
              ? 'bg-slate-950/40 border-slate-800/60 text-slate-600 cursor-not-allowed opacity-60'
              : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 hover:border-amber-500/40 text-slate-300 active:scale-95'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              Уровень 2
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/40">
              -40%
            </span>
          </div>
          <span className="text-xs font-medium text-slate-200">Подсветка</span>
          <span className="text-[10px] text-slate-400 mt-0.5">Фигура и поле</span>
        </button>

        {/* Уровень 3 */}
        <button
          type="button"
          disabled={disabled || currentHintLevel < 2 || currentHintLevel >= 3}
          onClick={() => onRequestHint(3)}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            currentHintLevel >= 3
              ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
              : currentHintLevel < 2 || disabled
              ? 'bg-slate-950/40 border-slate-800/60 text-slate-600 cursor-not-allowed opacity-60'
              : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 hover:border-amber-500/40 text-slate-300 active:scale-95'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-amber-400" />
              Уровень 3
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/40">
              -75%
            </span>
          </div>
          <span className="text-xs font-medium text-slate-200">Стрелка хода</span>
          <span className="text-[10px] text-slate-400 mt-0.5">Точный ход</span>
        </button>
      </div>

      {/* Блок отображения открытого контента подсказок */}
      {currentHintLevel === 0 ? (
        <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-center gap-3 text-xs text-slate-400">
          <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span>
            Используйте подсказки поэтапно, если расчет зашел в тупик. Каждая подсказка снижает итоговые очки шага.
          </span>
        </div>
      ) : (
        <div className="space-y-2.5 pt-1">
          {/* Концепт (Уровень 1) */}
          {currentHintLevel >= 1 && (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/40 text-xs text-amber-200 flex items-start gap-2.5">
              <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold text-amber-300 mr-1.5">Стратегическая идея:</span>
                <span>{hints.level1Concept}</span>
              </div>
            </div>
          )}

          {/* Подсветка (Уровень 2) */}
          {currentHintLevel >= 2 && hints.level2Highlight && (
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-100 flex items-start gap-2.5">
              <Eye className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold text-amber-300 mr-1.5">Фокус атаки:</span>
                <span>
                  Обратите внимание на фигуру на поле{' '}
                  <strong className="text-amber-200 uppercase font-mono">{hints.level2Highlight.fromSquare}</strong>
                  {hints.level2Highlight.toSquare && (
                    <>
                      {' '}и целевой пункт{' '}
                      <strong className="text-amber-200 uppercase font-mono">{hints.level2Highlight.toSquare}</strong>
                    </>
                  )}
                  .
                </span>
              </div>
            </div>
          )}

          {/* Точный ход (Уровень 3) */}
          {currentHintLevel >= 3 && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/60 text-xs text-emerald-200 flex items-start gap-2.5">
              <Navigation className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold text-emerald-300 mr-1.5">Точный ход:</span>
                <span>
                  Рекомендуемый ход:{' '}
                  <strong className="text-emerald-300 font-mono text-sm uppercase">
                    {hints.bestMoveSan || (hints.level3Arrow ? `${hints.level3Arrow[0]}-${hints.level3Arrow[1]}` : '')}
                  </strong>
                  . Зеленая стрелка отображена на доске.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HintPanel;
