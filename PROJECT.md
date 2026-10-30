# Current version — 24 October 2026

The current product is a light, minimal chess workbook with twelve topics following Vukovic's table of contents. The primary routes are `/` and `/course/[id]`. Content and provenance live in `src/data/course.ts`, lesson UI in `src/components/course`, and calculation/progress logic in `src/lib/courseSession.ts` and `src/lib/courseProgress.ts`. See README.md and SOURCE_NOTES.md for the current behaviour and verification limits.

The previous eighteen demo studies remain in source for comparison. Existing `/study/[id]` bookmarks redirect to the corresponding new course chapters. The historical implementation notes below describe that older demo. In particular, their attribution, difficulty ratings and claims about strongest defence are not acceptance evidence for the current course. chess.js proves move legality, not analytical strength.

---

# Project: Vukovic Chess Attack Training Platform

## Architecture
Modern client-only Next.js 14 (App Router) + TypeScript + Tailwind CSS platform for training middle-game attacking calculation based on Vladimir Vukovic's *The Art of Attack in Chess*.
- **Data Layer**: Static TypeScript/JSON dataset of 18 deeply annotated master studies with full branching variation trees, tactical themes, blunder refutations, and prerequisite checklists.
- **Chess Engine & Board Layer**: `chess.js` (move generation, legality validation, FEN/SAN transitions) + `react-chessboard` (drag-and-drop, click-to-move, SVG arrows, square highlighting) + Web Audio API synthesizer for zero-dependency sound effects.
- **Study & Analysis Layer**: Interactive tree navigation (`MoveNode` graph), breadcrumb trail, keyboard navigation, Vukovic theoretical callouts, prerequisite checklist.
- **Deep Calculation Trainer Layer**: 8-state FSM trainer requiring 3-7 consecutive forced moves, automated opponent stubborn responses, interactive blunder playback and refutation with pedagogical explanations, 3-tier hints ladder, calculation depth/time scoring, browser `localStorage` persistence.
- **Deployment Layer**: Zero-external-backend, SSG static pre-rendering with `generateStaticParams`, Vercel 1-click deployment compatibility.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1: Vukovic Master Dataset & Schemas | 18 detailed studies from Vukovic covering Greek Gift (Kg8, Kg6, Kh8, Kh6, Qd3 vs Qh5), Rook Lifts, Pawn Shield Demolition, and King Hunts with Russian annotations, NAGs, arrows, and highlights | M1 | Survey / R1 |
| 2 | F2: Interactive Chessboard & Audio Engine | SSR-safe ChessboardWrapper with react-chessboard & chess.js, legal move dots/targets, Drag&Drop, Click-to-move, promotion dialog, SVG arrow palette, Web Audio synth | M2 | Survey / R2 |
| 3 | F3: Interactive Study & Analysis UI | VariationTree component, move navigation (arrows, buttons), chapter/study catalog, Vukovic strategic callout boxes, prerequisite checklist card | M3 | Survey / R2 |
| 4 | F4: Deep Calculation Trainer Mode | 8-state FSM trainer, 3-7 ply forced calculation requirement, automated stubborn defense, interactive blunder refutation with physical playback, 3-tier hints, calculation scoring, localStorage | M4 | Survey / R3 |
| 5 | F5: Production Polish & Vercel Deploy | Production build (npm run build exits 0), zero lint/TS errors, responsive design (320px-1920px), vercel.json, comprehensive Russian README.md with 1-click deploy button | M5 | Survey / R4 |
| 6 | F6: Full E2E Test Suite & Adversarial Hardening | Requirement-driven opaque-box test suite passing 100% across Tiers 1-4, followed by Tier 5 adversarial coverage hardening | M6 | Survey / Dual Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Setup, Types & Vukovic Dataset | Next.js scaffold, Tailwind, strict TypeScript types, 18 validated studies dataset in Russian, chess validation scripts | none | DONE |
| M2 | Interactive Chessboard & Audio Engine | ChessboardWrapper, legal move indicators, drag/click handling, promotion modal, custom arrows/highlights, Web Audio synthesizer | M1 | DONE |
| M3 | Study Catalog & Variation Tree UI | Course catalog, chapter views, interactive VariationTree component, keyboard navigation, strategic callout boxes, prerequisite card | M2 | DONE |
| M4 | Deep Calculation Trainer Engine | 8-state FSM trainer, 3-7 forced plies calculation, opponent responses, blunder refutations with playback, 3-tier hints, scoring & localStorage | M2, M3 | DONE |
| M5 | Production Polish, Vercel Config & Docs | Full responsive styling, luxury chess dark theme, vercel.json, zero-warning production build, Russian README.md | M4 | DONE |
| M6 | E2E Test Suite Pass & Adversarial Hardening | Pass 100% of Tiers 1-4 tests published in TEST_READY.md, followed by Phase 2 Tier 5 adversarial hardening | M5, TEST_READY | DONE |

## Interface Contracts

### 1. Data Schema (`types/chess.ts`)
```typescript
import { Square } from 'chess.js';

export type NagType = '!' | '?' | '!!' | '??' | '!?' | '?!';

export interface ArrowConfig {
  from: Square;
  to: Square;
  color: string; // e.g. 'rgba(239, 68, 68, 0.8)' for threats, 'rgba(34, 197, 94, 0.8)' for moves
}

export interface MoveNode {
  id: string;
  san: string;
  uci: string;
  fen: string;
  turn: 'w' | 'b';
  comment?: string;
  nag?: NagType;
  arrows?: ArrowConfig[];
  highlights?: Record<string, string>;
  isForced?: boolean;
  isBlunderRefutation?: boolean;
  blunderExplanation?: string;
  children: MoveNode[];
}

export interface PrerequisiteChecklist {
  pawnOnE5: boolean;
  knightOnF6Absent: boolean;
  whiteBishopOnD3orC4: boolean;
  whiteKnightOnG5Available: boolean;
  whiteQueenOnH5orD3Available: boolean;
  h4PawnSupportReady: boolean;
  notes: string;
}

export interface VukovicStudy {
  id: string;
  title: string;
  white: string;
  black: string;
  year?: number;
  event?: string;
  eco?: string;
  initialFen: string;
  orientation: 'white' | 'black';
  chapter: 'greek_gift' | 'rook_lift' | 'pawn_demolition' | 'king_hunt';
  chapterTitle: string;
  difficulty: 1800 | 2000 | 2200;
  tags: string[];
  description: string;
  prerequisites?: PrerequisiteChecklist;
  rootNode: MoveNode;
  calculationTargetPlies: number;
}
```

### 2. Chessboard & UI Contracts (`components/chess/ChessboardWrapper.tsx`)
```typescript
export interface ChessboardWrapperProps {
  position: string; // FEN
  orientation?: 'white' | 'black';
  arePiecesDraggable?: boolean;
  onPieceDrop?: (sourceSquare: Square, targetSquare: Square, piece: string) => boolean;
  onSquareClick?: (square: Square) => void;
  customArrows?: [Square, Square, string?][];
  customSquareStyles?: Record<string, React.CSSProperties>;
  boardWidth?: number;
  autoResize?: boolean;
}
```

### 3. Calculation Trainer Engine Contract (`types/trainer.ts`)
```typescript
export type TrainerState =
  | 'IDLE'
  | 'WAITING_USER_MOVE'
  | 'EVALUATING_USER_MOVE'
  | 'STEP_SUCCESS'
  | 'ANIMATING_OPPONENT'
  | 'MISTAKE_EXPLANATION'
  | 'STUDY_COMPLETED'
  | 'ANALYSIS_MODE';

export interface BlunderDetail {
  attemptedSan: string;
  punishmentSan: string;
  punishmentFen: string;
  explanation: string;
  arrows: [Square, Square, string?][];
  highlights: Record<string, React.CSSProperties>;
}

export interface CalculationProgress {
  studyId: string;
  currentStepIndex: number;
  totalSteps: number;
  mistakesCount: number;
  hintsUsedCount: number;
  startTime: number;
  elapsedSeconds: number;
  completed: boolean;
  accuracyScore: number;
}
```

## Code Layout
```
/Users/user/teamwork_projects/vukovic_chess_attack/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── vercel.json
├── README.md
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── study/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Footer.tsx
│   │   ├── chess/
│   │   │   ├── ChessboardWrapper.tsx
│   │   │   ├── PromotionModal.tsx
│   │   │   └── BoardControls.tsx
│   │   ├── study/
│   │   │   ├── VariationTree.tsx
│   │   │   ├── MoveNavigation.tsx
│   │   │   ├── StrategicCallout.tsx
│   │   │   ├── PrerequisiteCard.tsx
│   │   │   └── StudyHeader.tsx
│   │   ├── trainer/
│   │   │   ├── CalculationTrainer.tsx
│   │   │   ├── BlunderModal.tsx
│   │   │   ├── HintPanel.tsx
│   │   │   ├── CalculationScoreCard.tsx
│   │   │   └── ModeSwitcher.tsx
│   │   └── catalog/
│   │       ├── ChapterSection.tsx
│   │       └── StudyCard.tsx
│   ├── data/
│   │   ├── studies/
│   │   │   ├── chapter1_greek_gift.ts
│   │   │   ├── chapter2_rook_lift.ts
│   │   │   ├── chapter3_pawn_demolition.ts
│   │   │   ├── chapter4_king_hunt.ts
│   │   │   └── index.ts
│   │   └── catalog.ts
│   ├── types/
│   │   ├── chess.ts
│   │   └── trainer.ts
│   └── lib/
│       ├── chessUtils.ts
│       ├── audioSynth.ts
│       ├── storage.ts
│       └── validation.ts
└── tests/
    └── e2e/
        ├── harness/
        ├── tier1_features/
        ├── tier2_boundaries/
        ├── tier3_combinations/
        ├── tier4_real_world/
        └── run_all_e2e.sh
```
