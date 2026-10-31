// Source health only: never engine scores, candidates or analysis details.
export const SCREEN_STATUS = {
  'no-capture': 'Выберите экран и доску',
  settling: 'Ожидаем устойчивый кадр',
  calibration: 'Нужно обучение фигур',
  editing: 'Подтвердите позицию',
  metadata: 'Подтвердите данные партии',
  ambiguous: 'Позиция не распознана',
  'tracking-lost': 'Подтвердите данные партии',
  'capture-lost': 'Захват недоступен',
  'game-over': 'Партия завершена',
} as const;
export type ScreenIssue = keyof typeof SCREEN_STATUS;
