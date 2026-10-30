import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import bank from '../src/data/trainingBank.json';
import { trainingExercises, trainingSkills, TRAINING_BANK_META } from '../src/data/trainingBank';
import { deepTheory } from '../src/data/deepTheory';
import { courseChapters } from '../src/data/course';

assert.equal(bank.length, 480);
assert.equal(trainingExercises.length, 480);
assert.equal(TRAINING_BANK_META.practiceCount, 384);
assert.equal(TRAINING_BANK_META.examCount, 96);
assert.equal(new Set(bank.map(row => row.sourceGameId)).size, 480, 'one position per source game');
assert.equal(new Set(bank.map(row => row.initialFen.split(' ').slice(0, 4).join(' '))).size, 480);
for (const skill of trainingSkills) {
  const rows = bank.filter(row => row.skillId === skill.id);
  assert.equal(rows.length, 80);
  assert.equal(rows.filter(row => row.split === 'exam').length, 16);
}
let plies = 0;
for (const row of bank) {
  assert(row.sourceRating >= 2200 && row.sourceRating <= 2800);
  assert(row.popularity >= 85 && row.plays >= 500 && row.ratingDeviation <= 85);
  assert(!row.themes.some(tag => ['endgame', 'mateIn1', 'mateIn2'].includes(tag)));
  assert(row.solutionSan.length >= 5);
  const game = new Chess(row.initialFen);
  for (const san of row.solutionSan) { game.move(san); plies += 1; }
  assert.match(row.gameUrl, /^https:\/\/lichess.org\//);
}
assert.equal(Object.keys(deepTheory).length, 12);
for (const chapter of courseChapters) {
  const theory = deepTheory[chapter.id as keyof typeof deepTheory];
  assert(theory);
  assert.equal(theory.sections.length, 5);
  assert(theory.sections.every(section => section.paragraphs.length && section.questions.length));
  assert(theory.synthesisQuestions.length >= 2 && theory.practiceProtocol.length >= 2);
}
console.log(`Training bank: 480 distinct games/positions, six balanced skills, 96 reserved positions, source filters and ${plies} legal solution plies. Theory: 12 chapters / 60 sections.`);
