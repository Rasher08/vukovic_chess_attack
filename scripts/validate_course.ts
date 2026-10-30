import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { courseChapters, courseExercises } from '../src/data/course';

assert.equal(courseChapters.length, 12, 'В программе должны быть все 12 глав');
assert.equal(new Set(courseChapters.map(c => c.id)).size, courseChapters.length, 'Повтор ID главы');
assert.equal(new Set(courseExercises.map(e => e.id)).size, courseExercises.length, 'Повтор ID задания');
assert.equal(new Set(courseExercises.map(e => e.initialFen)).size, courseExercises.length, 'Повтор исходной позиции');
const ids = new Set(courseExercises.map(e => e.id));
let plies = 0;
for (const chapter of courseChapters) {
  assert(chapter.theory.length > 0 && chapter.goals.length > 0, `Нет содержания: ${chapter.id}`);
  assert(chapter.exercises.length > 0, `Нет практики: ${chapter.id}`);
  assert(chapter.exercises.every(id => ids.has(id)), `Несуществующие задания: ${chapter.id}`);
  assert(chapter.exercises.every(id => courseExercises.find(e => e.id === id)?.chapterId === chapter.id), `Перепутана глава: ${chapter.id}`);
}
for (const exercise of courseExercises) {
  assert(courseChapters.some(c => c.id === exercise.chapterId && c.exercises.includes(exercise.id)), `Нет привязки: ${exercise.id}`);
  assert(exercise.sources.length > 0, `Нет источников: ${exercise.id}`);
  assert(exercise.solutionSan.length >= 3, `Недостаточный расчёт: ${exercise.id}`);
  assert(exercise.prompt && exercise.explanation && exercise.verification.note, `Недостаточное объяснение: ${exercise.id}`);
  if (exercise.decision) {
    assert(exercise.decision.options.some(o => o.id === exercise.decision!.correctOptionId), `Некорректная оценка: ${exercise.id}`);
    assert.equal(new Set(exercise.decision.options.map(o => o.id)).size, exercise.decision.options.length);
  }
  for (const line of [exercise.solutionSan, ...(exercise.alternativeLines || []).map(l => l.san)]) {
    const game = new Chess(exercise.initialFen);
    for (const san of line) {
      assert(!game.isGameOver(), `Ход после завершения партии: ${exercise.id} ${san}`);
      try { game.move(san); plies += 1; } catch { assert.fail(`Нелегальный ход ${san}: ${exercise.id}, ${game.fen()}`); }
    }
  }
}
assert(new Set(courseExercises.map(e => e.kind)).size >= 3, 'Практика должна проверять разные навыки');
console.log(`Проверено: ${courseChapters.length} глав, ${courseExercises.length} уникальных позиций, ${plies} легальных переходов, источники и связи.`);
