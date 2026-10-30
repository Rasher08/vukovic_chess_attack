export interface CourseSource {
  title: string;
  url: string;
}

export interface CourseChapter {
  id: string;
  number: number;
  title: string;
  summary: string;
  theory: string[];
  goals: string[];
  assessmentQuestions: string[];
  exercises: string[];
  sources: CourseSource[];
}

export interface CourseExercise {
  id: string;
  chapterId: string;
  title: string;
  initialFen: string;
  orientation: 'white' | 'black';
  task: string;
  prompt: string;
  kind: 'calculation' | 'decision' | 'defense' | 'evaluation';
  trainingMeta?: {
    skillId: string;
    sourceRating: number;
    split: 'practice' | 'exam';
    sourcePuzzleId: string;
  };
  solutionSan: string[];
  explanation: string;
  hints?: string[];
  decision?: {
    options: { id: string; label: string; explanation: string }[];
    correctOptionId: string;
  };
  alternativeLines?: {
    title: string;
    san: string[];
    explanation: string;
    accepted?: boolean;
  }[];
  sources: CourseSource[];
  verification: {
    legality: 'verified';
    engine: 'verified' | 'not-checked';
    engineDetails?: string;
    note: string;
  };
  provenance: {
    type: 'historical' | 'composed';
    game?: string;
    bookAttribution: 'verified' | 'not-claimed';
  };
}
