/**
 * Calculation Trainer FSM Harness.
 * Models the 8-state machine, 3-7 ply forcing calculations, blunder refutation triggers,
 * 3-tier hints ladder, and the official Vukovic calculation scoring equation.
 */

export type TrainerState =
  | 'IDLE'
  | 'WAITING_USER_MOVE'
  | 'EVALUATING_USER_MOVE'
  | 'STEP_SUCCESS'
  | 'ANIMATING_OPPONENT'
  | 'MISTAKE_EXPLANATION'
  | 'STUDY_COMPLETED'
  | 'ANALYSIS_MODE';

export type MoveQuality = 'best' | 'alternative' | 'inaccuracy' | 'blunder';

export interface BlunderDetail {
  attemptedSan: string;
  punishmentSan: string;
  punishmentFen: string;
  explanation: string;
  arrows: [string, string, string?][];
}

export interface CalculationStepSpec {
  stepIndex: number;
  moveNumber: number;
  fenBefore: string;
  expectedFenAfter: string;
  bestMoveSan: string;
  bestMoveUci: string;
  bestMoveExplanation: string;
  alternativeMoves?: { san: string; uci: string; explanation: string }[];
  inaccuracies?: { san: string; uci: string; explanation: string }[];
  blunders?: {
    san: string;
    uci: string;
    refutationSan: string;
    refutationUci: string;
    refutationFen: string;
    explanation: string;
  }[];
  hints: {
    level1Concept: string;
    level2Highlight: { fromSquare?: string; toSquare?: string };
    level3Arrow: [string, string];
  };
  opponentResponse?: {
    san: string;
    uci: string;
    fenAfter: string;
    comment: string;
  };
}

export interface TrainerStudySpec {
  id: string;
  title: string;
  initialFen: string;
  calculationTargetPlies: number;
  steps: CalculationStepSpec[];
}

export interface StepScoreBreakdown {
  stepIndex: number;
  baseScore: number;
  qualityMultiplier: number;
  hintMultiplier: number;
  attemptsMultiplier: number;
  timeMultiplier: number;
  finalStepScore: number;
  elapsedSeconds: number;
}

export class CalculationTrainerFsmHarness {
  public state: TrainerState = 'IDLE';
  public study: TrainerStudySpec | null = null;
  public currentStepIndex: number = 0;
  public currentFen: string = '';
  public activeBlunder: BlunderDetail | null = null;

  // Metrics
  public stepAttempts: number[] = [];
  public highestHintLevelUsed: number[] = []; // 0, 1, 2, 3
  public stepScores: StepScoreBreakdown[] = [];
  public cleanDepthPlies: number = 0;
  private cleanRunBroken: boolean = false;
  private previousStateBeforeAnalysis: TrainerState = 'IDLE';

  initStudy(study: TrainerStudySpec): void {
    this.study = study;
    this.currentStepIndex = 0;
    this.currentFen = study.initialFen;
    this.activeBlunder = null;
    this.stepAttempts = study.steps.map(() => 0);
    this.highestHintLevelUsed = study.steps.map(() => 0);
    this.stepScores = [];
    this.cleanDepthPlies = 0;
    this.cleanRunBroken = false;
    this.state = 'WAITING_USER_MOVE';
  }

  getCurrentStep(): CalculationStepSpec {
    if (!this.study || !this.study.steps[this.currentStepIndex]) {
      throw new Error(`Invalid step index ${this.currentStepIndex}`);
    }
    return this.study.steps[this.currentStepIndex];
  }

  requestHint(level: 1 | 2 | 3): { hintText: string; highlight?: any; arrow?: [string, string] } {
    if (this.state !== 'WAITING_USER_MOVE') {
      throw new Error(`Cannot request hint in state ${this.state}`);
    }
    const step = this.getCurrentStep();
    if (level > this.highestHintLevelUsed[this.currentStepIndex]) {
      this.highestHintLevelUsed[this.currentStepIndex] = level;
    }

    if (level >= 2) {
      this.cleanRunBroken = true;
    }

    if (level === 1) {
      return { hintText: step.hints.level1Concept };
    } else if (level === 2) {
      return { hintText: step.hints.level1Concept, highlight: step.hints.level2Highlight };
    } else {
      return {
        hintText: `Рекомендуемый ход: ${step.bestMoveSan}`,
        highlight: step.hints.level2Highlight,
        arrow: step.hints.level3Arrow,
      };
    }
  }

  submitUserMove(uciOrSan: string, elapsedSeconds: number = 5.0): {
    quality: MoveQuality;
    state: TrainerState;
    feedback: string;
  } {
    if (this.state !== 'WAITING_USER_MOVE') {
      throw new Error(`Cannot submit move while state is ${this.state}`);
    }

    this.state = 'EVALUATING_USER_MOVE';
    this.stepAttempts[this.currentStepIndex]++;
    const step = this.getCurrentStep();
    const cleanMove = uciOrSan.replace(/[!?+#\s]/g, '');

    // 1. Check if matches best move
    const isBest =
      cleanMove === step.bestMoveSan.replace(/[!?+#\s]/g, '') ||
      cleanMove === step.bestMoveUci;

    if (isBest) {
      return this.handleStepSuccess('best', elapsedSeconds, step.bestMoveExplanation);
    }

    // 2. Check alternative moves
    const matchedAlt = step.alternativeMoves?.find(
      (alt) =>
        cleanMove === alt.san.replace(/[!?+#\s]/g, '') || cleanMove === alt.uci
    );
    if (matchedAlt) {
      return this.handleStepSuccess('alternative', elapsedSeconds, matchedAlt.explanation);
    }

    // 3. Check inaccuracy moves
    const matchedInacc = step.inaccuracies?.find(
      (inacc) =>
        cleanMove === inacc.san.replace(/[!?+#\s]/g, '') || cleanMove === inacc.uci
    );
    if (matchedInacc) {
      this.cleanRunBroken = true;
      this.state = 'WAITING_USER_MOVE';
      return {
        quality: 'inaccuracy',
        state: this.state,
        feedback: matchedInacc.explanation,
      };
    }

    // 4. Check blunders
    this.cleanRunBroken = true;
    const matchedBlunder = step.blunders?.find(
      (b) => cleanMove === b.san.replace(/[!?+#\s]/g, '') || cleanMove === b.uci
    );

    if (matchedBlunder) {
      this.activeBlunder = {
        attemptedSan: matchedBlunder.san,
        punishmentSan: matchedBlunder.refutationSan,
        punishmentFen: matchedBlunder.refutationFen,
        explanation: matchedBlunder.explanation,
        arrows: [[matchedBlunder.refutationUci.slice(0, 2), matchedBlunder.refutationUci.slice(2, 4), 'red']],
      };
      this.currentFen = matchedBlunder.refutationFen;
      this.state = 'MISTAKE_EXPLANATION';
      return {
        quality: 'blunder',
        state: this.state,
        feedback: matchedBlunder.explanation,
      };
    }

    // 5. Default blunder / unexpected wrong move
    this.activeBlunder = {
      attemptedSan: uciOrSan,
      punishmentSan: '??',
      punishmentFen: step.fenBefore,
      explanation: 'Ход не соответствует концепции форсированной атаки Вуковича. Инициатива утрачена.',
      arrows: [],
    };
    this.state = 'MISTAKE_EXPLANATION';
    return {
      quality: 'blunder',
      state: this.state,
      feedback: 'Неверный ход. Попробуйте снова.',
    };
  }

  private handleStepSuccess(
    quality: 'best' | 'alternative',
    elapsedSeconds: number,
    explanation: string
  ): { quality: MoveQuality; state: TrainerState; feedback: string } {
    const step = this.getCurrentStep();
    const attempts = this.stepAttempts[this.currentStepIndex];
    const hintLevel = this.highestHintLevelUsed[this.currentStepIndex];

    if (!this.cleanRunBroken && attempts === 1 && hintLevel < 2) {
      this.cleanDepthPlies += 2; // user move + black reply
    } else {
      this.cleanRunBroken = true;
    }

    // Scoring Multipliers
    const baseScore = 100;
    const qualityMultiplier = quality === 'best' ? 1.0 : 0.90;

    let hintMultiplier = 1.0;
    if (hintLevel === 1) hintMultiplier = 0.85;
    else if (hintLevel === 2) hintMultiplier = 0.60;
    else if (hintLevel === 3) hintMultiplier = 0.25;

    let attemptsMultiplier = 1.0;
    if (attempts === 2) attemptsMultiplier = 0.50;
    else if (attempts >= 3) attemptsMultiplier = 0.25;

    let timeMultiplier = 1.0;
    if (elapsedSeconds < 2.0) timeMultiplier = 0.95;
    else if (elapsedSeconds <= 35.0) timeMultiplier = 1.00;
    else if (elapsedSeconds <= 75.0) timeMultiplier = 0.90;
    else timeMultiplier = 0.75;

    const finalStepScore = Math.round(
      baseScore * qualityMultiplier * hintMultiplier * attemptsMultiplier * timeMultiplier
    );

    this.stepScores.push({
      stepIndex: this.currentStepIndex,
      baseScore,
      qualityMultiplier,
      hintMultiplier,
      attemptsMultiplier,
      timeMultiplier,
      finalStepScore,
      elapsedSeconds,
    });

    this.currentFen = step.expectedFenAfter;
    this.state = 'STEP_SUCCESS';

    return {
      quality,
      state: this.state,
      feedback: explanation,
    };
  }

  dismissBlunder(): void {
    if (this.state !== 'MISTAKE_EXPLANATION') {
      throw new Error(`Cannot dismiss blunder when state is ${this.state}`);
    }
    const step = this.getCurrentStep();
    this.currentFen = step.fenBefore;
    this.activeBlunder = null;
    this.state = 'WAITING_USER_MOVE';
  }

  advanceOpponentMove(): TrainerState {
    if (this.state !== 'STEP_SUCCESS') {
      throw new Error(`Cannot advance opponent when state is ${this.state}`);
    }
    const step = this.getCurrentStep();
    this.state = 'ANIMATING_OPPONENT';

    if (step.opponentResponse) {
      this.currentFen = step.opponentResponse.fenAfter;
    }

    const isLastStep = this.currentStepIndex + 1 >= (this.study?.steps.length || 0);
    if (isLastStep) {
      this.state = 'STUDY_COMPLETED';
    } else {
      this.currentStepIndex++;
      this.state = 'WAITING_USER_MOVE';
    }
    return this.state;
  }

  toggleAnalysisMode(enable?: boolean): TrainerState {
    const shouldEnable = enable !== undefined ? enable : this.state !== 'ANALYSIS_MODE';
    if (shouldEnable) {
      this.previousStateBeforeAnalysis = this.state;
      this.state = 'ANALYSIS_MODE';
    } else {
      this.state = this.previousStateBeforeAnalysis;
    }
    return this.state;
  }

  calculateSessionSummary(): {
    totalScore: number;
    accuracyPercent: number;
    cleanDepthPlies: number;
    rankTitleRu: string;
    stars: number;
    isCompleted: boolean;
  } {
    const totalSteps = this.study?.steps.length || 1;
    const totalScore = this.stepScores.length > 0
      ? Math.round(this.stepScores.reduce((acc, s) => acc + s.finalStepScore, 0) / this.stepScores.length)
      : 0;

    const firstTryNoHintSteps = this.stepScores.filter(
      (s) => s.attemptsMultiplier === 1.0 && s.hintMultiplier === 1.0
    ).length;

    const accuracyPercent = Math.round((firstTryNoHintSteps / totalSteps) * 100);

    let rankTitleRu = 'Рекомендуется разбор';
    if (totalScore >= 92) rankTitleRu = 'Гроссмейстер атаки';
    else if (totalScore >= 78) rankTitleRu = 'Мастер атаки';
    else if (totalScore >= 60) rankTitleRu = 'Кандидат в мастера';
    else if (totalScore >= 40) rankTitleRu = 'Практик миттельшпиля';

    let stars = 1;
    if (totalScore >= 85 && accuracyPercent >= 80) stars = 3;
    else if (totalScore >= 60 && accuracyPercent >= 50) stars = 2;

    return {
      totalScore,
      accuracyPercent,
      cleanDepthPlies: this.cleanDepthPlies,
      rankTitleRu,
      stars,
      isCompleted: this.state === 'STUDY_COMPLETED',
    };
  }
}
