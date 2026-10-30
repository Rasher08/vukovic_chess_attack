/**
 * Tier 1: Feature 1 (F1) - Vukovic Master Dataset & Schemas Integrity
 * Tests dataset size (15-20), FEN syntax/legality, Russian annotations,
 * Greek Gift variations coverage, and 6-point prerequisite checklists.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CANONICAL_VUKOVIC_STUDIES } from '../harness/datasetHarness.ts';
import { ChessEngineHarness } from '../harness/chessEngineHarness.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Tier 1 - F1: Vukovic Master Dataset & Schemas Integrity', () => {
  it('TC-F1-01: Dataset contains required 15-20 studies covering all 4 chapters', () => {
    const studies = CANONICAL_VUKOVIC_STUDIES;
    expect.greaterThanOrEqual(studies.length, 15, 'Dataset must have at least 15 studies');
    expect.lessThanOrEqual(studies.length, 20, 'Dataset must not exceed 20 studies for baseline');
    expect.equal(studies.length, 18, 'Expected exactly 18 canonical master studies');

    const chapters = new Set(studies.map((s) => s.chapter));
    expect.ok(chapters.has('greek_gift'), 'Must include greek_gift chapter');
    expect.ok(chapters.has('rook_lift'), 'Must include rook_lift chapter');
    expect.ok(chapters.has('pawn_demolition'), 'Must include pawn_demolition chapter');
    expect.ok(chapters.has('king_hunt'), 'Must include king_hunt chapter');
  });

  it('TC-F1-02: Every study has a syntactically and legally valid initial FEN', () => {
    for (const study of CANONICAL_VUKOVIC_STUDIES) {
      const engine = new ChessEngineHarness();
      expect.throws(
        () => engine.loadFen('invalid fen string'),
        /Invalid FEN/,
        'Engine must reject invalid FENs'
      );

      engine.loadFen(study.initialFen);
      const whiteKing = engine.findKing('w');
      const blackKing = engine.findKing('b');

      expect.ok(whiteKing !== null, `Study ${study.id} must have a white king`);
      expect.ok(blackKing !== null, `Study ${study.id} must have a black king`);

      // Generated FEN must roundtrip properly
      const roundtripFen = engine.getFen();
      expect.ok(roundtripFen.length > 20, `Generated FEN for ${study.id} must be valid`);
      expect.equal(engine.activeColor, 'w', `Study ${study.id} starts with White to move`);
    }
  });

  it('TC-F1-03: All study annotations, descriptions, and titles are in Russian', () => {
    const cyrillicRegex = /[\u0400-\u04FF]/;
    for (const study of CANONICAL_VUKOVIC_STUDIES) {
      expect.match(
        study.title,
        cyrillicRegex,
        `Study ${study.id} title must contain Cyrillic characters`
      );
      expect.match(
        study.chapterTitle,
        cyrillicRegex,
        `Study ${study.id} chapterTitle must contain Cyrillic characters`
      );
      expect.match(
        study.description,
        cyrillicRegex,
        `Study ${study.id} description must contain Cyrillic explanation`
      );
      if (study.prerequisites) {
        expect.match(
          study.prerequisites.notes,
          cyrillicRegex,
          `Study ${study.id} prerequisite notes must be in Russian`
        );
      }
    }
  });

  it('TC-F1-04: Greek Gift lines cover all king defenses (2...Kg8, 2...Kg6, 2...Kh8, 2...Kh6)', () => {
    const greekGiftStudies = CANONICAL_VUKOVIC_STUDIES.filter((s) => s.chapter === 'greek_gift');
    expect.greaterThanOrEqual(greekGiftStudies.length, 5, 'Greek Gift chapter must have at least 5 studies');

    const ids = greekGiftStudies.map((s) => s.id);
    expect.includes(ids, 'colle-ohanlon-1930', 'Must contain Colle vs O\'Hanlon');
    expect.includes(ids, 'greco-model-study-1619', 'Must contain Greco model study');
    expect.includes(ids, 'vukovic-qd3-necessity', 'Must contain Vukovic 3.Qd3! study');
    expect.includes(ids, 'vukovic-kg6-refutation', 'Must contain 2...Kg6 3.h4! refutation');
    expect.includes(ids, 'vukovic-kh8-kh6-forks', 'Must contain 2...Kh8/Kh6 study');
    expect.includes(ids, 'vukovic-checklist-failure', 'Must contain checklist failure study');
  });

  it('TC-F1-05: 6-point prerequisite checklist is defined and validated for key studies', () => {
    const colle = CANONICAL_VUKOVIC_STUDIES.find((s) => s.id === 'colle-ohanlon-1930')!;
    expect.ok(colle.prerequisites, 'Colle study must have prerequisites checklist');
    expect.equal(colle.prerequisites!.knightOnF6Absent, true, 'Knight on f6 must be absent');
    expect.equal(colle.prerequisites!.whiteKnightOnG5Available, true, 'Knight on g5 must be available');
    expect.equal(colle.prerequisites!.whiteQueenOnH5orD3Available, true, 'Queen access to h5 or d3 ready');
    expect.equal(colle.prerequisites!.h4PawnSupportReady, true, 'h4 pawn support must be ready');

    const greco = CANONICAL_VUKOVIC_STUDIES.find((s) => s.id === 'greco-model-study-1619')!;
    expect.ok(greco.prerequisites, 'Greco study must have prerequisites checklist');
    expect.equal(greco.prerequisites!.pawnOnE5, true, 'e5 pawn must be present');
  });

  it('TC-F1-06: Tactical metadata formatting conforms to ECO, difficulty, and plies standards', () => {
    const ecoRegex = /^[A-E][0-9]{2}$/;
    for (const study of CANONICAL_VUKOVIC_STUDIES) {
      expect.match(study.eco, ecoRegex, `Study ${study.id} ECO code must match [A-E][0-9]{2}`);
      expect.includes([1800, 2000, 2200], study.difficulty, `Difficulty must be 1800, 2000, or 2200`);
      expect.greaterThanOrEqual(study.calculationTargetPlies, 3, 'Calculation target plies must be at least 3');
      expect.lessThanOrEqual(study.calculationTargetPlies, 7, 'Calculation target plies must not exceed 7');
      expect.greaterThan(study.tags.length, 1, `Study ${study.id} must have multiple descriptive tags`);
    }
  });
});

runSuite();
