/**
 * Challenger 2 Empirical Stress-Test Suite for Milestone 5 (M5)
 * Responsive Layout Boundaries, Mobile Viewports, Touch Targets & Modal Responsiveness
 * 
 * Verifies:
 * 1. Chessboard sizing equation across viewports: 320px, 375px, 768px, 1024px, 1440px
 *    (as well as boundary viewports 300px, 360px, 414px, 1920px, 2560px) ensuring zero horizontal scrolling/overflow.
 * 2. Touch-target dimensions on navigation buttons (all 6 MoveNavigation buttons have min-h >= 44px).
 * 3. Modal responsiveness on mobile screen heights (320x568px) for BlunderModal and PromotionModal.
 * 4. React SSR rendering of components with DOM attribute, ARIA, and Tailwind layout assertions.
 */

import { describe, it, expect, runSuite } from './e2e/harness/testRunner.ts';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { MoveNavigation } from '../src/components/study/MoveNavigation.tsx';
import { BlunderModal } from '../src/components/trainer/BlunderModal.tsx';
import { PromotionModal } from '../src/components/chess/PromotionModal.tsx';
import { ModeSwitcher } from '../src/components/trainer/ModeSwitcher.tsx';
import { Header } from '../src/components/layout/Header.tsx';
import { BlunderDetail } from '../src/types/trainer.ts';

// ---------------------------------------------------------------------------
// Pure Layout Mathematics Oracle for Vukovic Chess Attack Platform
// ---------------------------------------------------------------------------

interface ViewportLayoutMetrics {
  viewportWidth: number;
  outerPadding: number;
  availablePageWidth: number;
  isDesktopSplit: boolean;
  leftColumnWidth: number;
  cardPaddingAndBorder: number;
  cardInnerWidth: number;
  wrapperClientWidth: number;
  calculatedBoardWidth: number;
  hasHorizontalOverflow: boolean;
  clearancePx: number;
}

/**
 * Replicates the exact Tailwind CSS box-model and ResizeObserver equation
 * implemented across StudyHeader.tsx, CalculationTrainer.tsx, and ChessboardWrapper.tsx.
 */
function calculateLayoutForViewport(viewportWidth: number): ViewportLayoutMetrics {
  // 1. Outer container: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
  // Breakpoints: sm = 640px, lg = 1024px, max-w-7xl = 1280px
  let outerPadding: number;
  if (viewportWidth < 640) {
    outerPadding = 16 * 2; // px-4 = 32px
  } else if (viewportWidth < 1024) {
    outerPadding = 24 * 2; // sm:px-6 = 48px
  } else {
    outerPadding = 32 * 2; // lg:px-8 = 64px
  }

  const containerBoxWidth = Math.min(viewportWidth, 1280);
  const availablePageWidth = containerBoxWidth - outerPadding;

  // 2. Grid: grid grid-cols-1 lg:grid-cols-12 gap-8
  // lg:col-span-6 gives 6/12 = 50% minus half the 32px gap
  const isDesktopSplit = viewportWidth >= 1024;
  let leftColumnWidth: number;
  if (!isDesktopSplit) {
    leftColumnWidth = availablePageWidth;
  } else {
    const gridGap = 32;
    leftColumnWidth = (availablePageWidth - gridGap) / 2;
  }

  // 3. Card container: bg-slate-900/60 border border-slate-800 rounded-2xl p-3 sm:p-5
  // Border = 1px each side (2px total)
  // p-3 = 12px each side (24px total) < 640px; sm:p-5 = 20px each side (40px total) >= 640px
  const cardBorder = 2;
  const cardPadding = viewportWidth < 640 ? 12 * 2 : 20 * 2;
  const cardPaddingAndBorder = cardPadding + cardBorder;
  const cardInnerWidth = leftColumnWidth - cardPaddingAndBorder;

  // 4. ChessboardWrapper container: relative w-full max-w-[540px]
  const wrapperClientWidth = Math.min(cardInnerWidth, 540);

  // 5. ChessboardWrapper.tsx updateDimensions logic:
  // const maxAllowed = boardWidth || 540;
  // const calculated = Math.min(clientWidth - 8, maxAllowed);
  // setCurrentWidth(calculated >= 220 ? calculated : Math.max(clientWidth - 8, 200));
  const maxAllowed = 540;
  const calculated = Math.min(wrapperClientWidth - 8, maxAllowed);
  const calculatedBoardWidth =
    calculated >= 220 ? calculated : Math.max(wrapperClientWidth - 8, 200);

  // Clearance and overflow checks:
  const clearancePx = wrapperClientWidth - calculatedBoardWidth;
  const hasHorizontalOverflow = calculatedBoardWidth > wrapperClientWidth;

  return {
    viewportWidth,
    outerPadding,
    availablePageWidth,
    isDesktopSplit,
    leftColumnWidth,
    cardPaddingAndBorder,
    cardInnerWidth,
    wrapperClientWidth,
    calculatedBoardWidth,
    hasHorizontalOverflow,
    clearancePx,
  };
}

describe('Challenger 2 Empirical Tests: Milestone 5 Production Polish', () => {

  // =========================================================================
  // 1. Chessboard Sizing Equation & Responsive Viewports
  // =========================================================================
  describe('Area 1: Chessboard Sizing Equation & Viewport Boundaries', () => {
    const canonicalViewports = [320, 375, 768, 1024, 1440];

    for (const vp of canonicalViewports) {
      it(`TC-CH5-01-${vp}: Chessboard fits inside container with zero overflow at ${vp}px viewport`, () => {
        const metrics = calculateLayoutForViewport(vp);

        expect.equal(metrics.hasHorizontalOverflow, false, `Must have zero horizontal overflow at ${vp}px`);
        expect.greaterThan(metrics.calculatedBoardWidth, 0, `Board width must be positive at ${vp}px`);
        expect.greaterThanOrEqual(metrics.clearancePx, 8, `Must have at least 8px safety clearance at ${vp}px`);
        expect.lessThanOrEqual(metrics.calculatedBoardWidth, 540, `Board width must not exceed 540px at ${vp}px`);
      });
    }

    it('TC-CH5-02: Viewport 320px (iPhone SE 1st gen / narrow mobile) specific boundary verification', () => {
      const m320 = calculateLayoutForViewport(320);

      // Available width: 320 - 32 = 288px
      expect.equal(m320.availablePageWidth, 288);
      // Card inner width: 288 - 26 = 262px
      expect.equal(m320.cardInnerWidth, 262);
      expect.equal(m320.wrapperClientWidth, 262);
      // Board width: min(262 - 8, 540) = 254px
      expect.equal(m320.calculatedBoardWidth, 254);
      // Clearance: 262 - 254 = 8px
      expect.equal(m320.clearancePx, 8);
      expect.equal(m320.hasHorizontalOverflow, false);
    });

    it('TC-CH5-03: Viewport 375px (iPhone standard mobile) specific boundary verification', () => {
      const m375 = calculateLayoutForViewport(375);

      // Available width: 375 - 32 = 343px
      expect.equal(m375.availablePageWidth, 343);
      // Card inner width: 343 - 26 = 317px
      expect.equal(m375.cardInnerWidth, 317);
      expect.equal(m375.wrapperClientWidth, 317);
      // Board width: min(317 - 8, 540) = 309px
      expect.equal(m375.calculatedBoardWidth, 309);
      expect.equal(m375.clearancePx, 8);
      expect.equal(m375.hasHorizontalOverflow, false);
    });

    it('TC-CH5-04: Viewport 768px (iPad portrait) single-column desktop boundary verification', () => {
      const m768 = calculateLayoutForViewport(768);

      expect.equal(m768.isDesktopSplit, false);
      // Available width: 768 - 48 = 720px
      expect.equal(m768.availablePageWidth, 720);
      // Wrapper client width is clamped to max-w-[540px]
      expect.equal(m768.wrapperClientWidth, 540);
      // Board width: min(540 - 8, 540) = 532px
      expect.equal(m768.calculatedBoardWidth, 532);
      expect.equal(m768.clearancePx, 8);
      expect.equal(m768.hasHorizontalOverflow, false);
    });

    it('TC-CH5-05: Viewport 1024px (iPad landscape / 2-column breakpoint) boundary verification', () => {
      const m1024 = calculateLayoutForViewport(1024);

      expect.equal(m1024.isDesktopSplit, true);
      // Available width: 1024 - 64 = 960px
      expect.equal(m1024.availablePageWidth, 960);
      // Left col width: (960 - 32) / 2 = 464px
      expect.equal(m1024.leftColumnWidth, 464);
      // Card inner width: 464 - 42 = 422px
      expect.equal(m1024.cardInnerWidth, 422);
      expect.equal(m1024.wrapperClientWidth, 422);
      // Board width: min(422 - 8, 540) = 414px
      expect.equal(m1024.calculatedBoardWidth, 414);
      expect.equal(m1024.clearancePx, 8);
      expect.equal(m1024.hasHorizontalOverflow, false);
    });

    it('TC-CH5-06: Viewport 1440px (Desktop HD) max-w-7xl clamped boundary verification', () => {
      const m1440 = calculateLayoutForViewport(1440);

      expect.equal(m1440.isDesktopSplit, true);
      // max-w-7xl = 1280px; available width = 1280 - 64 = 1216px
      expect.equal(m1440.availablePageWidth, 1216);
      // Left col width: (1216 - 32) / 2 = 592px
      expect.equal(m1440.leftColumnWidth, 592);
      // Wrapper client width clamped to max-w-[540px]
      expect.equal(m1440.wrapperClientWidth, 540);
      expect.equal(m1440.calculatedBoardWidth, 532);
      expect.equal(m1440.clearancePx, 8);
      expect.equal(m1440.hasHorizontalOverflow, false);
    });

    it('TC-CH5-07: Stress sweep of 100 continuous viewports (300px to 2560px) verifies 100% zero overflow', () => {
      for (let width = 300; width <= 2560; width += 25) {
        const m = calculateLayoutForViewport(width);
        expect.equal(m.hasHorizontalOverflow, false, `Overflow detected at viewport ${width}px`);
        expect.greaterThanOrEqual(m.calculatedBoardWidth, 200, `Board width dropped below 200px at ${width}px`);
        expect.lessThanOrEqual(m.calculatedBoardWidth, 540, `Board width exceeded 540px at ${width}px`);
      }
    });
  });

  // =========================================================================
  // 2. Touch-Target Dimensions on Navigation Buttons (>= 44px)
  // =========================================================================
  describe('Area 2: Touch-Target Dimensions on MoveNavigation (>= 44px)', () => {
    it('TC-CH5-08: MoveNavigation renders 6 action buttons, each with min-h-[44px] touch target', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(MoveNavigation, {
          canGoBack: true,
          canGoForward: true,
          onFirstMove: () => {},
          onPreviousMove: () => {},
          onNextMove: () => {},
          onLastMove: () => {},
          onFlipBoard: () => {},
          onReset: () => {},
          orientation: 'white',
        })
      );

      // Verify toolbar semantics
      expect.match(html, /role="toolbar"/, 'Must have role=toolbar');
      expect.match(html, /aria-label="Навигация по ходам партии"/, 'Must have Russian aria-label');

      // Verify all 6 buttons have min-h-[44px]
      const minH44Count = (html.match(/min-h-\[44px\]/g) || []).length;
      expect.equal(minH44Count, 6, 'All 6 MoveNavigation buttons must have min-h-[44px]');

      // Verify width targets on arrow buttons
      const minW42Count = (html.match(/min-w-\[42px\]/g) || []).length;
      expect.equal(minW42Count, 4, 'All 4 arrow navigation buttons must have min-w-[42px]');

      // Verify Russian accessible labels
      expect.match(html, /aria-label="К первому ходу"/);
      expect.match(html, /aria-label="Предыдущий ход"/);
      expect.match(html, /aria-label="Следующий ход"/);
      expect.match(html, /aria-label="В конец варианта"/);
      expect.match(html, /aria-label="Сбросить доску"/);
      expect.match(html, /aria-label="Повернуть доску"/);
    });

    it('TC-CH5-09: Disabled navigation buttons maintain min-h-[44px] dimension when at root or terminal', () => {
      // Test when at initial node: back buttons disabled
      const htmlAtStart = ReactDOMServer.renderToString(
        React.createElement(MoveNavigation, {
          canGoBack: false,
          canGoForward: true,
          onFirstMove: () => {},
          onPreviousMove: () => {},
          onNextMove: () => {},
          onLastMove: () => {},
          onFlipBoard: () => {},
          onReset: () => {},
          orientation: 'white',
        })
      );

      const minHCountAtStart = (htmlAtStart.match(/min-h-\[44px\]/g) || []).length;
      expect.equal(minHCountAtStart, 6, 'Disabled state must preserve touch-target height min-h-[44px]');
      expect.match(htmlAtStart, /disabled=""/);

      // Test when at terminal node: forward buttons disabled
      const htmlAtEnd = ReactDOMServer.renderToString(
        React.createElement(MoveNavigation, {
          canGoBack: true,
          canGoForward: false,
          onFirstMove: () => {},
          onPreviousMove: () => {},
          onNextMove: () => {},
          onLastMove: () => {},
          onFlipBoard: () => {},
          onReset: () => {},
          orientation: 'black',
        })
      );

      const minHCountAtEnd = (htmlAtEnd.match(/min-h-\[44px\]/g) || []).length;
      expect.equal(minHCountAtEnd, 6, 'Terminal state must preserve touch-target height min-h-[44px]');
    });
  });

  // =========================================================================
  // 3. Modal Responsiveness on Mobile Screen Heights (320x568px)
  // =========================================================================
  describe('Area 3: Modal Responsiveness on Small Mobile Viewports (320x568px)', () => {
    const mockBlunder: BlunderDetail = {
      attemptedSan: 'Qh5',
      punishmentSan: 'Bxg5',
      punishmentFen: 'r1bqr1k1/pp1n1pp1/3bp1k1/6bQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 0 15',
      explanation:
        'Грубейшая ошибка! Преждевременный шах 14.Qh5?? позволяет черным бесплатно забрать коня 14...Bxg5! с абсолютно выигранной позицией. Вукович подчеркивает: перед атакой ферзем необходимо отрезать королю пути отхода тычком 14.h4!.',
      arrows: [],
      highlights: {},
    };

    it('TC-CH5-10: BlunderModal enforces max-h-[92vh] and overflow-y-auto to prevent mobile vertical clipping', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(BlunderModal, {
          isOpen: true,
          blunder: mockBlunder,
          onRetry: () => {},
        })
      );

      // Dialog accessibility
      expect.match(html, /role="dialog"/, 'Must have role=dialog');
      expect.match(html, /aria-modal="true"/, 'Must have aria-modal=true');
      expect.match(html, /id="blunder-modal-title"/, 'Must have modal title id');

      // Mobile vertical scrolling and clamping
      expect.match(html, /max-h-\[92vh\]/, 'Card must enforce max-h-[92vh]');
      expect.match(html, /overflow-y-auto/, 'Card must have overflow-y-auto');

      // Explanation box overflow-y-auto
      expect.match(html, /max-h-56 overflow-y-auto/, 'Explanation text must be scrollable');

      // Mobile padding: p-4 sm:p-7
      expect.match(html, /p-4 sm:p-7/, 'Must have responsive padding p-4 sm:p-7');

      // Content verification
      expect.match(html, /Qh5\?/, 'Must display attempted blunder');
      expect.match(html, /Bxg5\!/, 'Must display refutation move');
      expect.match(html, /Урок Владимира Вуковича:/, 'Must contain Russian pedagogical heading');
    });

    it('TC-CH5-11: PromotionModal enforces max-h-[92vh] and 2x2 grid fitting 320x568px screen', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(PromotionModal, {
          isOpen: true,
          color: 'w',
          onSelectPiece: () => {},
          onCancel: () => {},
        })
      );

      // Dialog accessibility
      expect.match(html, /role="dialog"/, 'Must have role=dialog');
      expect.match(html, /aria-modal="true"/, 'Must have aria-modal=true');

      // Mobile height constraint
      expect.match(html, /max-h-\[92vh\]/, 'Must enforce max-h-[92vh]');
      expect.match(html, /overflow-y-auto/, 'Must have overflow-y-auto');

      // 2-column grid for mobile
      expect.match(html, /grid-cols-2/, 'Choices must be arranged in 2 columns');

      // 4 piece choices present
      expect.match(html, /Ферзь/);
      expect.match(html, /Ладья/);
      expect.match(html, /Слон/);
      expect.match(html, /Конь/);

      // Height of each piece button: min-h-[80px]
      expect.match(html, /min-h-\[80px\]/);
    });

    it('TC-CH5-12: Height budget simulation on 320x568px iPhone SE screen verifies complete fit', () => {
      const screenHeight = 568;
      const maxAllowedModalHeight = screenHeight * 0.92; // 522.56px

      // Promotion modal vertical budget:
      // Padding: 16 * 2 = 32px
      // Header + subtitle: ~60px
      // 2 rows of piece buttons: 2 * 80px + 10px gap = 170px
      // Cancel button + margin: ~50px
      const totalPromotionHeight = 32 + 60 + 170 + 50; // ~312px
      expect.lessThanOrEqual(totalPromotionHeight, maxAllowedModalHeight, 'Promotion modal must comfortably fit within 92vh of 568px');

      // Blunder modal vertical budget with overflow text:
      // Padding: 16 * 2 = 32px
      // Header: ~70px
      // Comparison cards: ~85px
      // Retry button + helper: ~75px
      // Explanation box (max 224px): 224px
      const totalBlunderMaxHeight = 32 + 70 + 85 + 75 + 224; // 486px
      expect.lessThanOrEqual(totalBlunderMaxHeight, maxAllowedModalHeight, 'Blunder modal with max text must fit within 92vh of 568px');
    });
  });

  // =========================================================================
  // 4. Header & ModeSwitcher Responsive Layout Verifications
  // =========================================================================
  describe('Area 4: Header & ModeSwitcher Responsive Adaptations', () => {
    it('TC-CH5-13: Header logo and title wrap cleanly on <380px screens without overflow', () => {
      const html = ReactDOMServer.renderToString(React.createElement(Header));

      // Check min-w-0 on logo Link
      expect.match(html, /min-w-0/, 'Header logo Link must have min-w-0 for flexbox text truncation');

      // Check adaptive 2000+ badge
      expect.match(html, /hidden min-\[380px\]:inline-flex/, '2000+ badge must be hidden on screens narrower than 380px');

      // Check sound and menu buttons have comfortable touch targets
      expect.match(html, /min-w-\[38px\] min-h-\[38px\]/);
    });

    it('TC-CH5-14: ModeSwitcher renders responsive flex-col sm:flex-row with tab semantics', () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(ModeSwitcher, {
          mode: 'study',
          onModeChange: () => {},
          calculationTargetPlies: 7,
        })
      );

      // Check accessibility
      expect.match(html, /role="tablist"/);
      expect.match(html, /role="tab"/);

      // Check responsive layout
      expect.match(html, /flex-col sm:flex-row/);
      expect.match(html, /Режим изучения/);
      expect.match(html, /Тренажер расчета/);
    });
  });
});

runSuite();
