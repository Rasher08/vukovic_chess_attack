import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Chess, type Color } from 'chess.js';

const skills = [
  { id: 'king-attack', title: 'Атака на короля', description: 'Координация, открытие линий и конкретные угрозы вместо автоматической жертвы.' },
  { id: 'sacrifice', title: 'Жертва и компенсация', description: 'Расчёт принятия, промежуточных ответов и результата после форсированной ветки.' },
  { id: 'calculation', title: 'Длинный расчёт', description: 'Удержать порядок ходов, увидеть ответвления и проверить итоговую оценку.' },
  { id: 'defense', title: 'Защита и контрудар', description: 'Найти ресурс сопротивления: размен, активный ответ или точный порядок ходов.' },
  { id: 'quiet-move', title: 'Тихий ход и промежуточный ресурс', description: 'Сравнить форсирующие кандидаты с подготовкой и изменением порядка ходов.' },
  { id: 'mating-net', title: 'Матовая сеть', description: 'Учесть поля отхода, защитные включения и точную координацию нескольких фигур.' },
];
type SourceRow = Record<string, string>;
const rows: SourceRow[] = JSON.parse(readFileSync('content/training-bank/selected-source-rows.json', 'utf8'));
const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(game: Chess, color: Color) { return game.board().flat().reduce((sum, piece) => sum + (piece ? (piece.color === color ? 1 : -1) * values[piece.type] : 0), 0); }
function uci(game: Chess, move: string) { return game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) }); }
const digest = (id: string) => createHash('sha256').update('vukovic-training-v1:' + id).digest('hex');
const reserved = new Set(skills.flatMap(skill => rows.filter(row => row.skillId === skill.id).sort((a, b) => digest(a.PuzzleId).localeCompare(digest(b.PuzzleId))).slice(0, 16).map(row => row.PuzzleId)));
const positions = new Set<string>();
const sourceGames = new Set<string>();
let transitions = 0;
const bank = rows.map(row => {
  const game = new Chess(row.FEN);
  const moves = row.Moves.split(' ');
  uci(game, moves[0]); // Lichess FEN is BEFORE the opponent's setup move.
  transitions += 1;
  const initialFen = game.fen();
  const key = initialFen.split(' ').slice(0, 4).join(' ');
  if (positions.has(key)) throw new Error('Duplicate position: ' + row.PuzzleId);
  positions.add(key);
  const gameId = row.GameUrl.split('lichess.org/')[1].slice(0, 8);
  if (sourceGames.has(gameId)) throw new Error('Repeated source game: ' + gameId);
  sourceGames.add(gameId);
  const color = game.turn();
  const balanceBefore = material(game, color);
  const solutionSan: string[] = [];
  const first = uci(game, moves[1]);
  solutionSan.push(first.san); transitions += 1;
  for (const move of moves.slice(2)) { solutionSan.push(uci(game, move).san); transitions += 1; }
  const skill = skills.find(item => item.id === row.skillId)!;
  const pieces: Record<string, string> = { p: 'пешкой', n: 'конём', b: 'слоном', r: 'ладьёй', q: 'ферзём', k: 'королём' };
  const balanceAfter = material(game, color);
  const signed = (n: number) => n > 0 ? '+' + n : String(n);
  const conclusion = game.isCheckmate() ? 'Исходная ветка заканчивается матом.' : `Материальный баланс со стороны решающего меняется с ${signed(balanceBefore)} до ${signed(balanceAfter)} по условной шкале 1/3/3/5/9. Это описание материала, а не движковая оценка позиции.`;
  return {
    id: 'lp-' + row.PuzzleId, initialFen, solutionSan, skillId: row.skillId,
    sourcePuzzleId: row.PuzzleId, sourceRating: Number(row.Rating), ratingDeviation: Number(row.RatingDeviation),
    popularity: Number(row.Popularity), plays: Number(row.NbPlays), themes: row.Themes.split(' '),
    gameUrl: row.GameUrl, sourceGameId: gameId, split: reserved.has(row.PuzzleId) ? 'exam' : 'practice',
    title: `${skill.title} · ${row.PuzzleId}`,
    explanation: `В исходной ветке базы первый ход — ${first.san}: ${first.san.includes('+') || first.san.includes('#') ? 'шах' : 'ход без шаха'} ${pieces[first.piece]}${first.captured ? ' со взятием' : ' без взятия'}. ${solutionSan[1] ? `Подготовленный ответ соперника — ${solutionSan[1]}. ` : ''}${conclusion} Сравни эту ветку с ответами движка в своей попытке. Сформулируй, какой ответ изменил твою исходную оценку и почему второй кандидат оказался хуже или лучше.`,
  };
}).sort((a, b) => digest(a.id).localeCompare(digest(b.id)));
if (bank.length !== 480) throw new Error('Expected 480 positions');
const meta = { count: bank.length, practiceCount: bank.filter(x => x.split === 'practice').length, examCount: bank.filter(x => x.split === 'exam').length, minRating: Math.min(...bank.map(x => x.sourceRating)), maxRating: Math.max(...bank.map(x => x.sourceRating)), skills, source: 'https://database.lichess.org/', license: 'CC0-1.0', retrieved: '2026-10-24' };
writeFileSync('src/data/trainingBank.json', JSON.stringify(bank));
writeFileSync('src/data/trainingManifest.json', JSON.stringify(meta, null, 2) + '\n');
writeFileSync('content/training-bank/legality-report.json', JSON.stringify({ positions: bank.length, uniqueSourceGames: sourceGames.size, transitions, allLegal: true, practiceCount: meta.practiceCount, examCount: meta.examCount, sourceSetupMoveApplied: true }, null, 2) + '\n');
console.log(JSON.stringify({ ...meta, skills: skills.map(skill => ({ id: skill.id, count: bank.filter(row => row.skillId === skill.id).length })), transitions }, null, 2));
