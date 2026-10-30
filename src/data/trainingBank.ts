import type { CourseExercise } from '@/types/course';
import bank from './trainingBank.json';
import manifest from './trainingManifest.json';

export const trainingSkills = manifest.skills;
export const TRAINING_BANK_META = manifest;
export const trainingExercises: CourseExercise[] = bank.map(row => ({
  id: row.id, chapterId: 'training', title: row.title, initialFen: row.initialFen,
  orientation: row.initialFen.split(' ')[1] === 'w' ? 'white' : 'black',
  task: 'Оцени позицию и выбери продолжение.',
  prompt: 'Сопоставь кандидатов, сильнейший ответ соперника и конечную оценку. Сравни сыгранную линию с исходной веткой после завершения попытки.',
  kind: row.skillId === 'defense' ? 'defense' : 'calculation', solutionSan: row.solutionSan,
  explanation: row.explanation,
  trainingMeta: { skillId: row.skillId, sourceRating: row.sourceRating, sourcePuzzleId: row.sourcePuzzleId, split: row.split as 'practice' | 'exam' },
  sources: [
    { title: `Задача ${row.sourcePuzzleId} · Lichess`, url: `https://lichess.org/training/${row.sourcePuzzleId}` },
    { title: 'Исходная партия', url: row.gameUrl },
    { title: 'Открытая база и метод генерации · CC0', url: manifest.source },
  ],
  verification: { legality: 'verified', engine: 'not-checked', note: 'Линия получена из опубликованной базы Lichess; все ходы проверены chess.js. База генерируется с помощью Stockfish, но отдельная редакторская проверка каждой позиции в этом проекте не заявляется. Пользовательские ходы оцениваются браузерным движком после попытки.' },
  provenance: { type: 'historical', game: `Практическая партия · Lichess ${row.sourceGameId}`, bookAttribution: 'not-claimed' },
}));
