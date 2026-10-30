import { VukovicStudy } from '@/types/chess';
import { createVukovicStudy } from '@/lib/studyBuilder';

/**
 * Глава 2: Подключение тяжелых фигур — Ладейный лифт и вертикальные батареи
 * Включает 5 хрестоматийных этюдов:
 * 1. Эм. Ласкер — Бауэр (1889): Двойная жертва слонов и ладейный лифт Rf3-h3!
 * 2. З. Тарраш — фон Шеве (1894): Батарея по вертикали «g» и отвлечение 25.Bd6!!
 * 3. Ф. Маршалл — А. Берн (1900): Батарея по линии «h» и жертва 17.Rh8+!!
 * 4. Х.Р. Капабланка — М. Фонаров (1918): Централизация ладей, лифт и отвлечение
 * 5. Х.Р. Капабланка — Р. Бланко (1913): Тяжелофигурная батарея по открытой вертикали и цугцванг
 */

// 1. Эмануил Ласкер — Иоганн Бауэр (Амстердам, 1889)
const studyLaskerBauer: VukovicStudy = createVukovicStudy({
  id: 'lasker-bauer-1889',
  title: 'Эмануил Ласкер — Иоганн Бауэр (Амстердам, 1889)',
  white: 'Emanuel Lasker',
  black: 'Johann Hermann Bauer',
  year: 1889,
  event: 'Амстердам, международный турнир',
  eco: 'A03',
  initialFen: 'r4rk1/1b2bppp/pq2p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 1 15',
  orientation: 'white',
  chapter: 'rook_lift',
  chapterTitle: 'Глава 2: Ладейные лифты и вертикальные батареи',
  difficulty: 2000,
  tags: ['Двойная жертва слонов', 'Rook Lift', 'Rf3-h3', 'Двойной удар'],
  description:
    'Бессмертная партия 2-го чемпиона мира Эмануила Ласкера. Последовательно жертвуются оба слона (15.Bxh7+! и 17.Bxg7!), после чего ладья перебрасывается по 3-й горизонтали (19.Rf3!) для матовой атаки и выигрыша ферзя.',
  calculationTargetPlies: 7,
  rootNode: {
    id: 'bauer-1',
    san: 'Bxh7+',
    nag: '!',
    comment: 'Первая жертва слона! Черный конь на h5 остался без защиты.',
    arrows: [{ from: 'd3', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' }],
    highlights: { h7: 'rgba(239, 68, 68, 0.4)' },
    isForced: true,
    children: [
      {
        id: 'bauer-2',
        san: 'Kxh7',
        isForced: true,
        children: [
          {
            id: 'bauer-3',
            san: 'Qxh5+',
            nag: '!',
            comment: 'Ферзь забирает коня с шахом.',
            isForced: true,
            children: [
              {
                id: 'bauer-4',
                san: 'Kg8',
                children: [
                  {
                    id: 'bauer-5',
                    san: 'Bxg7',
                    nag: '!!',
                    comment:
                      'Вторая жертва слона! Ласкер полностью уничтожает пешечное прикрытие монарха. Пункт g7 разрушен.',
                    arrows: [{ from: 'e5', to: 'g7', color: 'rgba(239, 68, 68, 0.8)' }],
                    highlights: { g7: 'rgba(239, 68, 68, 0.4)' },
                    isForced: true,
                    children: [
                      {
                        id: 'bauer-6',
                        san: 'Kxg7',
                        comment: 'Король вынужден забрать второго слона.',
                        isForced: true,
                        children: [
                          {
                            id: 'bauer-7',
                            san: 'Qg4+',
                            nag: '!',
                            comment: 'Шах с оттеснением короля на край.',
                            isForced: true,
                            children: [
                              {
                                id: 'bauer-8-kh7',
                                san: 'Kh7',
                                children: [
                                  {
                                    id: 'bauer-9-rf3',
                                    san: 'Rf3',
                                    nag: '!!',
                                    comment:
                                      'Классический ладейный лифт (Rook Lift)! Ладья идет на h3 с неотразимой матовой угрозой Rh3#.',
                                    arrows: [{ from: 'f3', to: 'h3', color: 'rgba(34, 197, 94, 0.8)' }],
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'bauer-10-e5',
                                        san: 'e5',
                                        comment: 'Черные открывают диагональ слону b7 для защиты пункта h7.',
                                        children: [
                                          {
                                            id: 'bauer-11-rh3',
                                            san: 'Rh3+',
                                            nag: '!',
                                            comment: 'Ладья наносит удар!',
                                            isForced: true,
                                            children: [
                                              {
                                                id: 'bauer-12-qh6',
                                                san: 'Qh6',
                                                comment: 'Черные вынуждены отдать ферзя.',
                                                children: [
                                                  {
                                                    id: 'bauer-13-rxh6',
                                                    san: 'Rxh6+',
                                                    isForced: true,
                                                    children: [
                                                      {
                                                        id: 'bauer-14-kxh6',
                                                        san: 'Kxh6',
                                                        children: [
                                                          {
                                                            id: 'bauer-15-qd7',
                                                            san: 'Qd7',
                                                            nag: '!',
                                                            comment:
                                                              'Финальный двойной удар! Белые нападают на слонов b7 и e7, забирая обе легкие фигуры с абсолютным материальным перевесом.',
                                                            arrows: [
                                                              { from: 'd7', to: 'b7', color: 'rgba(239, 68, 68, 0.8)' },
                                                              { from: 'd7', to: 'e7', color: 'rgba(239, 68, 68, 0.8)' },
                                                            ],
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
                              {
                                id: 'bauer-8-kh8',
                                san: 'Kh8',
                                children: [
                                  {
                                    id: 'bauer-9-kh8-qh5',
                                    san: 'Qh5+',
                                    children: [
                                      {
                                        id: 'bauer-10-kh8-kg8',
                                        san: 'Kg8',
                                        children: [
                                          {
                                            id: 'bauer-11-kh8-rf3',
                                            san: 'Rf3',
                                            comment: 'Тот же ладейный лифт Rf3-h3# решает немедленно.',
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
});

// 2. Зигберт Тарраш — Теодор фон Шеве (Лейпциг, 1894)
const studyTarraschScheve: VukovicStudy = createVukovicStudy({
  id: 'tarrasch-scheve-1894',
  title: 'Зигберт Тарраш — Теодор фон Шеве (Лейпциг, 1894)',
  white: 'Siegbert Tarrasch',
  black: 'Theodor von Scheve',
  year: 1894,
  event: 'Лейпциг, 9-й конгресс Германского шахматного союза',
  eco: 'D37',
  initialFen: '6k1/r2bqrpp/2p1pn1Q/pp2BpR1/2PP4/P3PP1P/1P6/2K2BR1 w - - 8 25',
  orientation: 'white',
  chapter: 'rook_lift',
  chapterTitle: 'Глава 2: Ладейные лифты и вертикальные батареи',
  difficulty: 2000,
  tags: ['Батарея по линии g', 'Отвлечение', '25.Bd6!!', 'Связка по вертикали'],
  description:
    'Классический пример методичной концентрации тяжелых фигур по вертикали «g». Белые сдвоили ладьи Rg1+Rg5 и ферзя Qh6. Решает фантастический тактический удар 25.Bd6!!, отвлекающий черного ферзя от защиты пункта f7 и пункта g7.',
  calculationTargetPlies: 6,
  rootNode: {
    id: 'tarrasch-1',
    san: 'Bd6',
    nag: '!!',
    comment:
      'Гениальный отвлекающий удар! Белые жертвуют слона, пользуясь перегрузкой черного ферзя e7. Брать 25...Qxd6 форсирует мат.',
    arrows: [{ from: 'e5', to: 'd6', color: 'rgba(34, 197, 94, 0.8)' }],
    highlights: { d6: 'rgba(34, 197, 94, 0.4)' },
    isForced: true,
    children: [
      {
        id: 'tarrasch-2-qxd6',
        san: 'Qxd6',
        comment: 'Взятие обязательно, иначе теряется ферзь.',
        isForced: true,
        children: [
          {
            id: 'tarrasch-3-rxg7',
            san: 'Rxg7+',
            nag: '!',
            comment: 'Вскрытие короля по линии «g»! Ладья крушит оборону.',
            isForced: true,
            children: [
              {
                id: 'tarrasch-4-kf8',
                san: 'Kf8',
                children: [
                  {
                    id: 'tarrasch-5-rxf7',
                    san: 'Rxf7+',
                    nag: '!',
                    comment: 'Вскрытый двойной шах! Ладья и ферзь атакуют короля.',
                    isForced: true,
                    children: [
                      {
                        id: 'tarrasch-6-kxf7',
                        san: 'Kxf7',
                        children: [
                          {
                            id: 'tarrasch-7-rg7',
                            san: 'Rg7+',
                            nag: '!',
                            comment: 'Подключение второй ладьи по линии «g» с шахом.',
                            isForced: true,
                            children: [
                              {
                                id: 'tarrasch-8-ke8',
                                san: 'Ke8',
                                children: [
                                  {
                                    id: 'tarrasch-9-qxf6',
                                    san: 'Qxf6',
                                    nag: '!',
                                    comment: 'Ферзь забирает коня, восстанавливая материальное равенство и грозя матом на e7 и g8.',
                                    arrows: [{ from: 'f6', to: 'e7', color: 'rgba(239, 68, 68, 0.8)' }],
                                    children: [
                                      {
                                        id: 'tarrasch-10-qe7',
                                        san: 'Qe7',
                                        comment: 'Попытка черных прикрыть поле e7 ферзем.',
                                        children: [
                                          {
                                            id: 'tarrasch-11-rg8',
                                            san: 'Rg8+',
                                            comment: 'Вторжение на 8-ю горизонталь.',
                                            children: [
                                              {
                                                id: 'tarrasch-12-qf8',
                                                san: 'Qf8',
                                                children: [
                                                  {
                                                    id: 'tarrasch-13-rxf8',
                                                    san: 'Rxf8#',
                                                    nag: '!!',
                                                    comment: 'Мат тяжелыми фигурами!',
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

// 3. Фрэнк Маршалл — Амос Берн (Париж, 1900)
const studyMarshallBurn: VukovicStudy = createVukovicStudy({
  id: 'marshall-burn-1900',
  title: 'Фрэнк Маршалл — Амос Берн (Париж, 1900)',
  white: 'Frank Marshall',
  black: 'Amos Burn',
  year: 1900,
  event: 'Париж, Всемирная выставка',
  eco: 'D55',
  initialFen: 'rn1qr1k1/pbp2pb1/1p4p1/3p4/3P4/2NBPN2/PPQ2PP1/R3K2R w KQ - 2 14',
  orientation: 'white',
  chapter: 'rook_lift',
  chapterTitle: 'Глава 2: Ладейные лифты и вертикальные батареи',
  difficulty: 2000,
  tags: ['Батарея по линии h', '17.Rh8+!!', 'Жертва ладьи', 'Разрушение прикрытия'],
  description:
    'Атакующий шедевр Фрэнка Маршалла: белые разрушают пешечный щит 14.Bxg6! fxg6 15.Qxg6, подключают коня на g5 и завершают партию ошеломляющей жертвой ладьи 17.Rh8+!! с последующим матом ферзем на h7.',
  calculationTargetPlies: 5,
  rootNode: {
    id: 'marshall-1',
    san: 'Bxg6',
    nag: '!',
    comment: 'Разрушение пешечного клина рокировки. Пешка g6 уничтожается.',
    arrows: [{ from: 'd3', to: 'g6', color: 'rgba(239, 68, 68, 0.8)' }],
    highlights: { g6: 'rgba(239, 68, 68, 0.4)' },
    isForced: true,
    children: [
      {
        id: 'marshall-2',
        san: 'fxg6',
        comment: 'Взятие пешкой f7 вскрывает вертикаль «f» и диагональ к королю.',
        isForced: true,
        children: [
          {
            id: 'marshall-3',
            san: 'Qxg6',
            nag: '!',
            comment: 'Ферзь вторгается в образовавшуюся брешь.',
            isForced: true,
            children: [
              {
                id: 'marshall-4',
                san: 'Nd7',
                comment: 'Черные пытаются ввести резервы в защиту королевского фланга.',
                children: [
                  {
                    id: 'marshall-5',
                    san: 'Ng5',
                    nag: '!',
                    comment: 'Конь занимает ключевой атакующий пункт g5, угрожая матом на f7.',
                    arrows: [{ from: 'g5', to: 'f7', color: 'rgba(239, 68, 68, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'marshall-6',
                        san: 'Qf6',
                        comment: 'Черный ферзь берет под защиту поле f7.',
                        children: [
                          {
                            id: 'marshall-7',
                            san: 'Rh8+',
                            nag: '!!',
                            comment:
                              'Бессмертная жертва ладьи Маршалла! Белые завлекают короля под линейный мат по вертикали «h».',
                            arrows: [{ from: 'h1', to: 'h8', color: 'rgba(239, 68, 68, 0.8)' }],
                            highlights: { h8: 'rgba(239, 68, 68, 0.5)' },
                            isForced: true,
                            children: [
                              {
                                id: 'marshall-8',
                                san: 'Kxh8',
                                comment: 'Взятие вынуждено.',
                                isForced: true,
                                children: [
                                  {
                                    id: 'marshall-9',
                                    san: 'Qh7#',
                                    nag: '!!',
                                    comment: 'Мат! Конь g5 прикрывает ферзя на h7. Гениальная вертикальная батарея.',
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

// 4. Хосе Рауль Капабланка — Марк Фонаров (Нью-Йорк, 1918)
const studyCapablancaFonaroff: VukovicStudy = createVukovicStudy({
  id: 'capablanca-fonaroff-1918',
  title: 'Хосе Рауль Капабланка — Марк Фонаров (Нью-Йорк, 1918)',
  white: 'Jose Raul Capablanca',
  black: 'Marc Fonaroff',
  year: 1918,
  event: 'Нью-Йорк, клубная миниатюра',
  eco: 'C66',
  initialFen: '3r1rk1/ppq2ppp/2pp1b2/4nN2/4PB2/6Q1/PPP2PPP/3RR1K1 w - - 10 17',
  orientation: 'white',
  chapter: 'rook_lift',
  chapterTitle: 'Глава 2: Ладейные лифты и вертикальные батареи',
  difficulty: 2000,
  tags: ['Централизация', 'Ладейный размен', 'Отвлечение', '22.Nxf7+!'],
  description:
    'Хирургическая точность Капабланки. Белые вскрывают вертикаль «d» ходом 17.Rxd6!, устраняют ключевого защитника e5 и завершают комбинацию промежуточным ударом 22.Nxf7+!, оставаясь с лишней фигурой.',
  calculationTargetPlies: 7,
  rootNode: {
    id: 'capa-fon-1',
    san: 'Rxd6',
    nag: '!',
    comment: 'Капабланка пробивает пешечную опору черных на d6.',
    arrows: [{ from: 'd1', to: 'd6', color: 'rgba(34, 197, 94, 0.8)' }],
    isForced: true,
    children: [
      {
        id: 'capa-fon-2',
        san: 'Rxd6',
        comment: 'Черные принимают вызов на вертикали «d».',
        isForced: true,
        children: [
          {
            id: 'capa-fon-3',
            san: 'Bxe5',
            nag: '!',
            comment: 'Устранение коня e5, защищавшего пункт d7.',
            isForced: true,
            children: [
              {
                id: 'capa-fon-4',
                san: 'Rd1',
                comment: 'Отчаянная контригра черных по 1-й горизонтали.',
                children: [
                  {
                    id: 'capa-fon-5',
                    san: 'Rxd1',
                    isForced: true,
                    children: [
                      {
                        id: 'capa-fon-6',
                        san: 'Qxe5',
                        comment: 'Черные забирают слона.',
                        children: [
                          {
                            id: 'capa-fon-7',
                            san: 'Nh6+',
                            nag: '!',
                            comment: 'Вскрытый шах! Король черных загоняется в угол.',
                            isForced: true,
                            children: [
                              {
                                id: 'capa-fon-8',
                                san: 'Kh8',
                                children: [
                                  {
                                    id: 'capa-fon-9',
                                    san: 'Qxe5',
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'capa-fon-10',
                                        san: 'Bxe5',
                                        children: [
                                          {
                                            id: 'capa-fon-11',
                                            san: 'Nxf7+',
                                            nag: '!!',
                                            comment:
                                              'Гениальный финальный удар Капабланки! Вилка на короля и слона e5. Белые остаются с чистой лишней фигурой.',
                                            arrows: [
                                              { from: 'f7', to: 'h8', color: 'rgba(239, 68, 68, 0.8)' },
                                              { from: 'f7', to: 'e5', color: 'rgba(239, 68, 68, 0.8)' },
                                            ],
                                            isForced: true,
                                            children: [
                                              {
                                                id: 'capa-fon-12',
                                                san: 'Kg8',
                                                children: [
                                                  {
                                                    id: 'capa-fon-13',
                                                    san: 'Nxe5',
                                                    comment: 'Белые забирают слона. У белых здоровая лишняя легкая фигура и выигранная позиция.',
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

// 5. Хосе Рауль Капабланка — Рафаэль Бланко (Гавана, 1913)
const studyCapablancaBlanco: VukovicStudy = createVukovicStudy({
  id: 'capablanca-blanco-1913',
  title: 'Хосе Рауль Капабланка — Рафаэль Бланко (Гавана, 1913)',
  white: 'Jose Raul Capablanca',
  black: 'Rafael Blanco',
  year: 1913,
  event: 'Гавана, чемпионат Кубы',
  eco: 'C10',
  initialFen: '6k1/p3r2p/1p1qbrpQ/2pBRp2/2P5/8/PP3PPP/4R1K1 w - - 8 30',
  orientation: 'white',
  chapter: 'rook_lift',
  chapterTitle: 'Глава 2: Ладейные лифты и вертикальные батареи',
  difficulty: 2200,
  tags: ['Тяжелофигурная батарея', 'Цугцванг', 'Связка по вертикали e', 'Упрощение позиции'],
  description:
    'Образец позиционного удушения от Капабланки. Белые утроили тяжелые фигуры по вертикали «e» (Re5, Re1, слон d5) и связывают черные силы. Серия точных разменов и фиксация 33.f4! ставит черных в полный цугцванг.',
  calculationTargetPlies: 6,
  rootNode: {
    id: 'blanco-1',
    san: 'Rxe6',
    nag: '!',
    comment: 'Капабланка начинает разгрузочную операцию по вскрытой вертикали.',
    arrows: [{ from: 'e5', to: 'e6', color: 'rgba(34, 197, 94, 0.8)' }],
    isForced: true,
    children: [
      {
        id: 'blanco-2',
        san: 'Rfxe6',
        comment: 'Черные забирают ладьей f6.',
        isForced: true,
        children: [
          {
            id: 'blanco-3',
            san: 'Rxe6',
            nag: '!',
            comment: 'Вторая ладья белых подключается к размену.',
            isForced: true,
            children: [
              {
                id: 'blanco-4',
                san: 'Rxe6',
                isForced: true,
                children: [
                  {
                    id: 'blanco-5',
                    san: 'Qe3',
                    nag: '!',
                    comment: 'Ферзь занимает вертикаль «e», сохраняя связку по линии короля.',
                    arrows: [{ from: 'e3', to: 'e6', color: 'rgba(239, 68, 68, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'blanco-6',
                        san: 'Kf7',
                        comment: 'Черный монарх защищает ладью e6.',
                        children: [
                          {
                            id: 'blanco-7',
                            san: 'f4',
                            nag: '!',
                            comment:
                              'Гениальный тихий ход! Капабланка укрепляет пункт e5 и ставит черных в цугцванг. Любое движение черных ведет к немедленным потерям.',
                            isForced: true,
                            children: [
                              {
                                id: 'blanco-8',
                                san: 'Ke7',
                                comment: 'Король пытается уйти из-под связки.',
                                children: [
                                  {
                                    id: 'blanco-9',
                                    san: 'Bxe6',
                                    nag: '!',
                                    comment: 'Белые забирают ладью, выигрывая качество и чистую пешку.',
                                    children: [
                                      {
                                        id: 'blanco-10',
                                        san: 'Qxe6',
                                        children: [
                                          {
                                            id: 'blanco-11',
                                            san: 'Qxe6+',
                                            comment: 'Переход в абсолютно выигранный пешечный эндшпиль.',
                                            children: [
                                              {
                                                id: 'blanco-12',
                                                san: 'Kxe6',
                                                comment: 'Пешечный эндшпиль абсолютно безнадежен для черных.',
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
});

export const chapter2Studies: VukovicStudy[] = [
  studyLaskerBauer,
  studyTarraschScheve,
  studyMarshallBurn,
  studyCapablancaFonaroff,
  studyCapablancaBlanco,
];
