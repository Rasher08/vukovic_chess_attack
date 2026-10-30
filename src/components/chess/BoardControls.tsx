'use client';

import React from 'react';
import { ArrowUpDown, Volume2, VolumeX, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

export interface BoardControlsProps {
  /**
   * Текущая ориентация доски ('white' - белые снизу, 'black' - черные снизу)
   */
  orientation: 'white' | 'black';
  /**
   * Функция переворота доски
   */
  onFlipOrientation: () => void;
  /**
   * Включен ли звук
   */
  isSoundEnabled?: boolean;
  /**
   * Функция переключения звука
   */
  onToggleSound: () => void;
  /**
   * Функция сброса позиции к исходному состоянию
   */
  onResetPosition?: () => void;
  /**
   * Возможность сделать шаг назад
   */
  canUndo?: boolean;
  /**
   * Шаг назад по ходам
   */
  onUndo?: () => void;
  /**
   * Возможность сделать шаг вперед
   */
  canRedo?: boolean;
  /**
   * Шаг вперед по ходам
   */
  onRedo?: () => void;
  /**
   * Дополнительные CSS классы контейнера
   */
  className?: string;
}

/**
 * Панель управления шахматной доской:
 * - Переворот доски (смена ориентации белые/черные)
 * - Включение / отключение звука (Web Audio)
 * - Сброс к начальной позиции
 * - Пошаговая навигация назад/вперед
 */
export function BoardControls({
  orientation,
  onFlipOrientation,
  isSoundEnabled = true,
  onToggleSound,
  onResetPosition,
  canUndo = false,
  onUndo,
  canRedo = false,
  onRedo,
  className = '',
}: BoardControlsProps) {
  return (
    <div
      className={`w-full max-w-[540px] flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl shadow-lg backdrop-blur select-none ${className}`}
      role="toolbar"
      aria-label="Управление шахматной доской"
    >
      {/* Левая группа: Навигация по ходам (если поддерживается) */}
      <div className="flex items-center gap-1">
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-colors"
            title="Шаг назад (Стрелка влево)"
            aria-label="Шаг назад"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {onRedo && (
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-colors"
            title="Шаг вперед (Стрелка вправо)"
            aria-label="Шаг вперед"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {onResetPosition && (
          <button
            type="button"
            onClick={onResetPosition}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-xs font-medium text-slate-300 hover:text-white transition-all border border-slate-700/60"
            title="Сбросить позицию к исходной"
            aria-label="Сбросить позицию"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">В начало</span>
          </button>
        )}
      </div>

      {/* Правая группа: Ориентация и Звук */}
      <div className="flex items-center gap-2">
        {/* Кнопка переворота доски */}
        <button
          type="button"
          onClick={onFlipOrientation}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-xs font-medium text-slate-300 hover:text-white transition-all border border-slate-700/60"
          title={`Повернуть доску (сейчас: ${orientation === 'white' ? 'Белые' : 'Черные'})`}
          aria-label="Повернуть доску"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">
            {orientation === 'white' ? 'Белые снизу' : 'Черные снизу'}
          </span>
          <span className="sm:hidden">
            {orientation === 'white' ? 'Бел.' : 'Черн.'}
          </span>
        </button>

        {/* Кнопка переключения звука */}
        <button
          type="button"
          onClick={onToggleSound}
          className={`flex items-center justify-center p-2 rounded-lg transition-all border ${
            isSoundEnabled
              ? 'bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border-slate-700/60'
              : 'bg-slate-900 text-slate-500 hover:text-slate-300 border-slate-800'
          }`}
          title={isSoundEnabled ? 'Звук включен (клик для выключения)' : 'Звук выключен (клик для включения)'}
          aria-label={isSoundEnabled ? 'Выключить звук' : 'Включить звук'}
        >
          {isSoundEnabled ? (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
}

export default BoardControls;
