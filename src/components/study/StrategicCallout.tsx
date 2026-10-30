import React from 'react';
import { MoveNode, VukovicStudy } from '@/types/chess';
import { Quote, AlertTriangle, Sparkles, Swords, Lightbulb, BookOpen } from 'lucide-react';

export interface StrategicCalloutProps {
  currentNode?: MoveNode | null;
  study: VukovicStudy;
  className?: string;
}

export function StrategicCallout({
  currentNode,
  study,
  className = '',
}: StrategicCalloutProps) {
  // 1. Сценарий: Опровержение зевка или ошибки (NAG ?? или флаг isBlunderRefutation)
  if (currentNode && (currentNode.isBlunderRefutation || currentNode.nag === '??')) {
    return (
      <div
        className={`rounded-xl border border-rose-500/50 bg-rose-950/40 p-4 shadow-lg shadow-rose-950/20 backdrop-blur transition-all ${className}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-400">
              Ложный след • Опровержение ошибки ({currentNode.san})
            </span>
            <h4 className="text-sm font-bold text-slate-100">
              Комментарий к варианту
            </h4>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-rose-200/90 leading-relaxed pl-9">
          {currentNode.blunderExplanation ||
            currentNode.comment ||
            'Грубая ошибка! Черные немедленно перехватывают инициативу и опровергают атаку белых.'}
        </p>
      </div>
    );
  }

  // 2. Сценарий: Блестящий ход или жертва (NAG !!)
  if (currentNode && currentNode.nag === '!!') {
    return (
      <div
        className={`rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 shadow-lg shadow-amber-950/20 backdrop-blur transition-all ${className}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400">
              Блестящий ход • Решающая жертва ({currentNode.san})
            </span>
            <h4 className="text-sm font-bold text-slate-100">
              Идея варианта
            </h4>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed pl-9">
          {currentNode.comment ||
            'Классический сокрушительный удар! Защита короля взломана, начинается форсированная матовая атака.'}
        </p>
      </div>
    );
  }

  // 3. Сценарий: Сильнейший ход (NAG !)
  if (currentNode && currentNode.nag === '!') {
    return (
      <div
        className={`rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 shadow-lg shadow-emerald-950/20 backdrop-blur transition-all ${className}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Swords className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
              Ход учебной линии ({currentNode.san})
            </span>
            <h4 className="text-sm font-bold text-slate-100">
              Форсированное развитие инициативы
            </h4>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-emerald-200/90 leading-relaxed pl-9">
          {currentNode.comment ||
            'Точнейшее тактическое продолжение, не дающее королю шансов на спасение.'}
        </p>
      </div>
    );
  }

  // 4. Сценарий: Обычный узел с комментарием
  if (currentNode && currentNode.comment) {
    return (
      <div
        className={`rounded-xl border border-slate-700/80 bg-slate-900/80 p-4 shadow-lg backdrop-blur transition-all ${className}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center">
            <Quote className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-mono font-medium text-slate-400">
              Анализ позиции после хода {currentNode.san}
            </span>
            <h4 className="text-sm font-bold text-slate-100">
              Учебный комментарий
            </h4>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-9">
          {currentNode.comment}
        </p>
      </div>
    );
  }

  // 5. По умолчанию: Главная методологическая идея этюда
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg backdrop-blur transition-all ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <Lightbulb className="w-4 h-4" />
        </div>
        <div>
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-400">
            Стратегический замысел партии
          </span>
          <h4 className="text-sm font-bold text-slate-100">
            Принцип атаки Владимира Вуковича
          </h4>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-9 mb-3">
        {study.description}
      </p>

      <div className="pl-9 text-xs text-slate-400 italic border-l-2 border-slate-700 ml-9 pl-3">
        «Нельзя атаковать короля вслепую: каждый форсированный ход должен либо отнимать поля отступления, либо подключать новые тяжелые резервы.»
      </div>
    </div>
  );
}

export default StrategicCallout;
