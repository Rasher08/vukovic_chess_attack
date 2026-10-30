import React, { useState } from 'react';
import { PrerequisiteChecklist } from '@/types/chess';
import { CheckCircle2, XCircle, ShieldCheck, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

export interface PrerequisiteCardProps {
  prerequisites?: PrerequisiteChecklist;
  className?: string;
}

export function PrerequisiteCard({ prerequisites, className = '' }: PrerequisiteCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (!prerequisites) {
    return null;
  }

  const checklistItems: { key: keyof Omit<PrerequisiteChecklist, 'notes'>; label: string }[] = [
    { key: 'pawnOnE5', label: 'Пешка на e5 фиксирует пункт f6' },
    { key: 'knightOnF6Absent', label: 'Черный защитный конь f6 отсутствует или отвлечен' },
    { key: 'whiteBishopOnD3orC4', label: 'Белопольный слон готов к жертве на h7' },
    { key: 'whiteKnightOnG5Available', label: 'Конь может беспрепятственно вторгнуться на g5' },
    { key: 'whiteQueenOnH5orD3Available', label: 'Ферзь имеет доступ к пунктам h5 или d3' },
    { key: 'h4PawnSupportReady', label: 'Пешка h2 готова к продвижению h4 при выходе короля на g6' },
  ];

  const satisfiedCount = checklistItems.filter((item) => prerequisites[item.key]).length;
  const isPerfect = satisfiedCount === 6;

  return (
    <div
      className={`rounded-xl border transition-all ${
        isPerfect
          ? 'bg-slate-900/90 border-emerald-500/30 shadow-md shadow-emerald-500/5'
          : 'bg-slate-900/90 border-rose-500/30 shadow-md shadow-rose-500/5'
      } ${className}`}
    >
      {/* Заголовок с аккордеоном */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left select-none"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isPerfect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Чек-лист предпосылок Вуковича
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isPerfect
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {satisfiedCount} / 6 условий
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              {isPerfect
                ? 'Все условия для сокрушительной жертвы Bxh7+ соблюдены'
                : 'Внимание: жертва слона некорректна из-за нарушения предпосылок!'}
            </p>
          </div>
        </div>

        <div className="text-slate-400 hover:text-slate-200">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Список 6 пунктов */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800/80 space-y-2.5">
          <div className="grid grid-cols-1 gap-2 pt-2">
            {checklistItems.map((item) => {
              const isChecked = Boolean(prerequisites[item.key]);
              return (
                <div
                  key={item.key}
                  className={`flex items-start gap-2.5 p-2 rounded-lg text-xs transition-colors ${
                    isChecked
                      ? 'bg-emerald-950/20 border border-emerald-900/30 text-emerald-300'
                      : 'bg-rose-950/30 border border-rose-900/40 text-rose-300 font-medium'
                  }`}
                >
                  {isChecked ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <span className="leading-tight">{item.label}</span>
                    {!isChecked && (
                      <span className="block text-[11px] text-rose-400/90 font-normal mt-0.5">
                        Отсутствует или не подготовлено!
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Примечание автора по позиции */}
          {prerequisites.notes && (
            <div className="mt-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-300 leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Комментарий Вуковича к позиции: </span>
                {prerequisites.notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PrerequisiteCard;
