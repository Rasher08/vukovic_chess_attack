import { VukovicStudy } from '@/types/chess';
import { createVukovicStudy } from '@/lib/studyBuilder';

/**
 * Глава 4: Бессмертная охота на короля (The Immortal King Hunts)
 * Включает 4 великих образца преследования неприятельского монарха:
 * 1. Эдвард Ласкер — сэр Джордж Томас (1912): 8-ходовое преследование через всю доску g8 -> g1 с матом 18.Kd2# / 18.O-O-O#
 * 2. Рихард Рети — Савелий Тартаковер (1910): Жертва ферзя 9.Qd8+!! и двойной шах 10.Bg5+! с двумя матами
 * 3. Джоакино Греко (1619): Разрушительная охота за королем после 14.Bxe7+! и выгон короля в центр
 * 4. Учебный этюд Вуковича: Батарея по вертикали «h» и матовое преследование
 */

// 1. Эдвард Ласкер — сэр Джордж Томас (Лондон, 1912)
const studyEdLaskerThomas: VukovicStudy = createVukovicStudy({
  id: 'ed-lasker-thomas-1912',
  title: 'Эдвард Ласкер — сэр Джордж Томас (Лондон, 1912)',
  white: 'Edward Lasker',
  black: 'Sir George Thomas',
  year: 1912,
  event: 'Лондон, City of London Chess Club',
  eco: 'A40',
  initialFen: 'r4rk1/pbppq1pp/1pn1pn2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 4 11',
  orientation: 'white',
  chapter: 'king_hunt',
  chapterTitle: 'Глава 4: Бессмертная охота на короля (King Hunts)',
  difficulty: 2000,
  tags: ['Бессмертная партия', '11.Qxh7+!!', 'Охота на короля', 'Двойной шах', 'Мат королем'],
  description:
    'Вершина темы «Охота на короля» в мировой шахматной литературе. Белые жертвуют ферзя 11.Qxh7+!! и каскадом форсированных шахов конями, пешками и слоном гонят черного короля через всю доску: g8 -> h6 -> g5 -> f4 -> f3 -> g2 -> g1, объявляя тихий мат 18.Kd2# (или эстетический 18.O-O-O#).',
  calculationTargetPlies: 8,
  rootNode: {
    id: 'lasker-hunt-1',
    san: 'Qxh7+',
    nag: '!!',
    comment:
      'Бессмертная жертва ферзя! Ласкер вырывает короля из его укреплений. Начало легендарного марша через всю доску.',
    arrows: [{ from: 'h5', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' }],
    highlights: { h7: 'rgba(239, 68, 68, 0.5)' },
    isForced: true,
    children: [
      {
        id: 'lasker-hunt-2',
        san: 'Kxh7',
        comment: 'Взятие обязательно.',
        isForced: true,
        children: [
          {
            id: 'lasker-hunt-3',
            san: 'Nxf6+',
            nag: '!!',
            comment:
              'Двойной шах конем и слоном d3! От двойного шаха можно только убегать королем.',
            arrows: [
              { from: 'e4', to: 'f6', color: 'rgba(239, 68, 68, 0.8)' },
              { from: 'd3', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' },
            ],
            isForced: true,
            children: [
              {
                id: 'lasker-hunt-4-kh6',
                san: 'Kh6',
                comment: 'Король вынужден идти вперед. Попытка 12...Kh8 ведет к немедленному мату 13.Ng6#.',
                children: [
                  {
                    id: 'lasker-hunt-5-neg4',
                    san: 'Neg4+',
                    nag: '!',
                    comment: 'Шах вторым конем! Король выгоняется в открытое поле g5.',
                    arrows: [{ from: 'e5', to: 'g4', color: 'rgba(34, 197, 94, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'lasker-hunt-6-kg5',
                        san: 'Kg5',
                        comment: 'Единственное легальное отступление.',
                        isForced: true,
                        children: [
                          {
                            id: 'lasker-hunt-7-h4',
                            san: 'h4+',
                            nag: '!',
                            comment: 'Шах пешкой! Королевский фланг смыкает кольцо вокруг монарха.',
                            isForced: true,
                            children: [
                              {
                                id: 'lasker-hunt-8-kf4',
                                san: 'Kf4',
                                comment: 'Король черных переходит на половину доски белых.',
                                isForced: true,
                                children: [
                                  {
                                    id: 'lasker-hunt-9-g3',
                                    san: 'g3+',
                                    nag: '!',
                                    comment: 'Еще один шаг вперед! Пути назад отрезаны.',
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'lasker-hunt-10-kf3',
                                        san: 'Kf3',
                                        comment: 'Король на 3-й горизонтали!',
                                        isForced: true,
                                        children: [
                                          {
                                            id: 'lasker-hunt-11-be2',
                                            san: 'Be2+',
                                            nag: '!',
                                            comment: 'Белопольный слон вступает в охоту.',
                                            isForced: true,
                                            children: [
                                              {
                                                id: 'lasker-hunt-12-kg2',
                                                san: 'Kg2',
                                                comment: 'Монарх ступает на вторую горизонталь белых.',
                                                isForced: true,
                                                children: [
                                                  {
                                                    id: 'lasker-hunt-13-rh2',
                                                    san: 'Rh2+',
                                                    nag: '!',
                                                    comment: 'Ладья оттесняет короля на порог белого монарха.',
                                                    isForced: true,
                                                    children: [
                                                      {
                                                        id: 'lasker-hunt-14-kg1',
                                                        san: 'Kg1',
                                                        comment: 'Король пришел на g1 — в лагерь белых.',
                                                        isForced: true,
                                                        children: [
                                                          {
                                                            id: 'lasker-hunt-15-kd2',
                                                            san: 'Kd2#',
                                                            nag: '!!',
                                                            comment:
                                                              'Невероятный финал! Король белых делает скромный шаг 18.Kd2#, открывая ладью a1 для мата! (Также эстетически безупречно 18.O-O-O#).',
                                                            arrows: [{ from: 'a1', to: 'd1', color: 'rgba(34, 197, 94, 0.8)' }],
                                                            children: [],
                                                          },
                                                        ],
                                                      },
                                                    ],
                                                  },
                                                ],
                                              },
                                            ],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'lasker-hunt-4-kh8',
                san: 'Kh8',
                nag: '?',
                comment: 'Отступление в угол допускает немедленный мат в 1 ход.',
                children: [
                  {
                    id: 'lasker-hunt-5-ng6',
                    san: 'Ng6#',
                    nag: '!!',
                    comment: 'Мат конем на g6!',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

// 2. Рихард Рети — Савелий Тартаковер (Вена, 1910)
const studyRetiTartakower: VukovicStudy = createVukovicStudy({
  id: 'reti-tartakower-1910',
  title: 'Рихард Рети — Савелий Тартаковер (Вена, 1910)',
  white: 'Richard Reti',
  black: 'Savielly Tartakower',
  year: 1910,
  event: 'Вена, юбилейный турнир',
  eco: 'B15',
  initialFen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
  orientation: 'white',
  chapter: 'king_hunt',
  chapterTitle: 'Глава 4: Бессмертная охота на короля (King Hunts)',
  difficulty: 1800,
  tags: ['9.Qd8+!!', 'Двойной шах', 'Два красивых мата', 'Защита Каро-Канн'],
  description:
    'Одна из самых знаменитых миниатюр в истории шахмат. Рети жертвует ферзя 9.Qd8+!!, завлекая черного короля на d8, а затем объявляет смертельный двойной шах 10.Bg5+!, завершая преследование матом 11.Rd8# или 11.Bd8#.',
  calculationTargetPlies: 3,
  rootNode: {
    id: 'reti-1',
    san: 'Qd8+',
    nag: '!!',
    comment:
      'Ошеломляющая жертва ферзя! Рети заманивает черного монарха под двойной вскрытый удар.',
    arrows: [{ from: 'd3', to: 'd8', color: 'rgba(239, 68, 68, 0.8)' }],
    highlights: { d8: 'rgba(239, 68, 68, 0.5)' },
    isForced: true,
    children: [
      {
        id: 'reti-2',
        san: 'Kxd8',
        comment: 'Единственный легальный ответ.',
        isForced: true,
        children: [
          {
            id: 'reti-3',
            san: 'Bg5+',
            nag: '!!',
            comment:
              'Смертоносный двойной шах ладьей d1 и слоном g5! Король черных должен бежать на e8 или c7.',
            arrows: [
              { from: 'd1', to: 'd8', color: 'rgba(239, 68, 68, 0.8)' },
              { from: 'g5', to: 'd8', color: 'rgba(239, 68, 68, 0.8)' },
            ],
            isForced: true,
            children: [
              {
                id: 'reti-4-ke8',
                san: 'Ke8',
                comment: 'Отступление короля назад на e8.',
                children: [
                  {
                    id: 'reti-5-rd8',
                    san: 'Rd8#',
                    nag: '!!',
                    comment:
                      'Мат ладьей по вертикали «d»! Слон g5 защищает ладью. Классическая геометрия.',
                    children: [],
                  },
                ],
              },
              {
                id: 'reti-4-kc7',
                san: 'Kc7',
                comment: 'Попытка убежать на ферзевый фланг.',
                children: [
                  {
                    id: 'reti-5-bd8',
                    san: 'Bd8#',
                    nag: '!!',
                    comment:
                      'Мат слоном! Ладья d1 прикрывает слона на d8. Эстетический шедевр Рети.',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

// 3. Джоакино Греко (1619) — Королевская охота и жертва ферзя
const studyGrecoKingHunt: VukovicStudy = createVukovicStudy({
  id: 'greco-king-hunt-1619',
  title: 'Джоакино Греко — Королевская охота и жертва ферзя (1619)',
  white: 'Gioachino Greco',
  black: 'NN',
  year: 1619,
  event: 'Рим, Итальянская партия',
  eco: 'C54',
  initialFen: 'r1bq1k1r/ppp1nBpp/8/3p2B1/3P4/1Q3N2/P4PPP/b3R1K1 w - - 0 14',
  orientation: 'white',
  chapter: 'king_hunt',
  chapterTitle: 'Глава 4: Бессмертная охота на короля (King Hunts)',
  difficulty: 2000,
  tags: ['Итальянская партия', '14.Bxe7+!', 'Жертва ферзя', 'Охота на монарха'],
  description:
    'Исторический этюд мастера Джоакино Греко. Белые устраняют защитника 14.Bxe7+!, отдают ладью за ферзя и заставляют черного короля пуститься в гибельный рейд через всю доску.',
  calculationTargetPlies: 7,
  rootNode: {
    id: 'greco-hunt-1',
    san: 'Bxe7+',
    nag: '!',
    comment: 'Греко крушит оборону черного короля, забирая связанного коня e7.',
    arrows: [{ from: 'g5', to: 'e7', color: 'rgba(239, 68, 68, 0.8)' }],
    isForced: true,
    children: [
      {
        id: 'greco-hunt-2',
        san: 'Qxe7',
        comment: 'Ферзь забирает слона.',
        isForced: true,
        children: [
          {
            id: 'greco-hunt-3',
            san: 'Rxe7',
            nag: '!',
            comment: 'Белые отдают ладью за ферзя, полностью лишая черных координации.',
            isForced: true,
            children: [
              {
                id: 'greco-hunt-4',
                san: 'Kxe7',
                comment: 'Король выходит на e7.',
                isForced: true,
                children: [
                  {
                    id: 'greco-hunt-5',
                    san: 'Bxd5',
                    nag: '!',
                    comment: 'Белые забирают пешку d5, открывая дорогу ферзю.',
                    isForced: true,
                    children: [
                      {
                        id: 'greco-hunt-6',
                        san: 'c6',
                        comment: 'Черные пытаются прогнать слона.',
                        children: [
                          {
                            id: 'greco-hunt-7',
                            san: 'Qe3+',
                            nag: '!',
                            comment: 'Ферзь вступает в игру с шахом!',
                            arrows: [{ from: 'b3', to: 'e3', color: 'rgba(34, 197, 94, 0.8)' }],
                            isForced: true,
                            children: [
                              {
                                id: 'greco-hunt-8',
                                san: 'Kd8',
                                children: [
                                  {
                                    id: 'greco-hunt-9',
                                    san: 'Qg5+',
                                    nag: '!',
                                    comment: 'Король черных оттесняется на ферзевый фланг.',
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'greco-hunt-10',
                                        san: 'Kc7',
                                        children: [
                                          {
                                            id: 'greco-hunt-11',
                                            san: 'Qe5+',
                                            nag: '!',
                                            comment: 'Серия шахов заставляет короля выйти на b6.',
                                            isForced: true,
                                            children: [
                                              {
                                                id: 'greco-hunt-12',
                                                san: 'Kb6',
                                                children: [
                                                  {
                                                    id: 'greco-hunt-13',
                                                    san: 'Nd2',
                                                    nag: '!',
                                                    comment:
                                                      'Подключение коня с угрозой Nc4+ и быстрым матом. Король черных пойман в центре доски.',
                                                    children: [],
                                                  },
                                                ],
                                              },
                                            ],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

// 4. Учебный этюд Вуковича: Батарея по вертикали «h» и преследование
const studyVukovicDualBatteryKingHunt: VukovicStudy = createVukovicStudy({
  id: 'vukovic-dual-battery-king-hunt',
  title: 'Учебный этюд Вуковича: Батарея по вертикали «h» и преследование',
  white: 'Vladimir Vukovic',
  black: 'Theoretical Model',
  year: 1965,
  event: '«The Art of Attack in Chess», Глава 6',
  eco: 'C05',
  initialFen: 'r4rk1/pp1bq3/4p1p1/3pP1N1/3P1p1Q/2P5/PP4PP/R4RK1 w - - 0 20',
  orientation: 'white',
  chapter: 'king_hunt',
  chapterTitle: 'Глава 4: Бессмертная охота на короля (King Hunts)',
  difficulty: 2000,
  tags: ['Батарея по h', 'Вскрытие f-линии', '20.Rxf4!', 'Форсированный мат'],
  description:
    'Модельный пример Вуковича на комбинацию вертикальной батареи по линии «h» и вскрытия линии «f». Белые играют 20.Rxf4!, ликвидируя пешечный заслон. Взятие 20...Rxf4 форсирует красивый мат 21.Qh7+ Kf8 22.Qh8#.',
  calculationTargetPlies: 5,
  rootNode: {
    id: 'vuk-hunt-1',
    san: 'Rxf4',
    nag: '!',
    comment:
      'Белые устраняют пешку f4, открывая линию ладье и создавая угрозу вторжения на h7.',
    arrows: [{ from: 'f1', to: 'f4', color: 'rgba(34, 197, 94, 0.8)' }],
    isForced: true,
    children: [
      {
        id: 'vuk-hunt-2-rxf4',
        san: 'Rxf4',
        comment: 'Черные забирают ладью, допуская форсированный мат.',
        children: [
          {
            id: 'vuk-hunt-3-qh7',
            san: 'Qh7+',
            nag: '!',
            comment: 'Шах! Король оттесняется на f8.',
            isForced: true,
            children: [
              {
                id: 'vuk-hunt-4-kf8',
                san: 'Kf8',
                children: [
                  {
                    id: 'vuk-hunt-5-qh8',
                    san: 'Qh8#',
                    nag: '!!',
                    comment:
                      'Чистый мат по 8-й горизонтали! Конь g5 и пешка e5 держат поля отступления.',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'vuk-hunt-2-qg7',
        san: 'Qg7',
        comment: 'Черные пытаются прикрыть пункт h7 ферзем.',
        children: [
          {
            id: 'vuk-hunt-3-raf1',
            san: 'Raf1',
            nag: '!',
            comment: 'Сдвоение ладей по вертикали «f». Белые полностью доминируют.',
            children: [
              {
                id: 'vuk-hunt-4-qg7-rxf4',
                san: 'Rxf4',
                children: [
                  {
                    id: 'vuk-hunt-5-qg7-rxf4',
                    san: 'Rxf4',
                    children: [
                      {
                        id: 'vuk-hunt-6-qg7-rf8',
                        san: 'Rf8',
                        children: [
                          {
                            id: 'vuk-hunt-7-qg7-rxf8',
                            san: 'Rxf8+',
                            children: [
                              {
                                id: 'vuk-hunt-8-qg7-kxf8',
                                san: 'Kxf8',
                                children: [
                                  {
                                    id: 'vuk-hunt-9-qg7-qh8',
                                    san: 'Qh8+',
                                    comment: 'Ферзь вторгается с шахом, выигрывая партию.',
                                    children: [],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

export const chapter4Studies: VukovicStudy[] = [
  studyEdLaskerThomas,
  studyRetiTartakower,
  studyGrecoKingHunt,
  studyVukovicDualBatteryKingHunt,
];
