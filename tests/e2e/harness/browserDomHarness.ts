/**
 * Virtual DOM and Chessboard Interaction Harness.
 * Simulates click-to-move, drag-and-drop, promotion modal,
 * SVG arrow palettes, square styling, and keyboard navigation.
 */

import { ChessEngineHarness } from './chessEngineHarness.ts';
import type { Square, PieceType } from './chessEngineHarness.ts';

export interface MoveNodeRecord {
  id: string;
  parentId: string | null;
  san: string;
  uci: string;
  fen: string;
  turn: 'w' | 'b';
  comment?: string;
  nag?: string;
  arrows?: [Square, Square, string?][];
  highlights?: Record<string, string>;
  children: string[];
}

export class BrowserDomHarness {
  public engine: ChessEngineHarness;
  public selectedSquare: Square | null = null;
  public legalMoveTargets: Square[] = [];
  public arrows: [Square, Square, string?][] = [];
  public squareStyles: Record<string, Record<string, string>> = {};
  public arePiecesDraggable: boolean = true;
  public isBoardLocked: boolean = false;

  // Promotion
  public isPromotionModalOpen: boolean = false;
  public pendingPromotion: { from: Square; to: Square } | null = null;

  // Tree Navigation
  public treeNodes: Map<string, MoveNodeRecord> = new Map();
  public currentNodeId: string | null = null;
  public rootNodeId: string | null = null;
  public isFogOfWarEnabled: boolean = false;

  // Event callbacks
  public onMoveAttempt?: (from: Square, to: Square, promotion?: PieceType) => boolean;

  constructor(initialFen?: string) {
    this.engine = new ChessEngineHarness(initialFen);
  }

  loadTree(nodes: MoveNodeRecord[], rootId: string): void {
    this.treeNodes.clear();
    for (const node of nodes) {
      this.treeNodes.set(node.id, node);
    }
    this.rootNodeId = rootId;
    this.currentNodeId = rootId;
    const rootNode = this.treeNodes.get(rootId);
    if (rootNode) {
      this.engine.loadFen(rootNode.fen);
      this.arrows = rootNode.arrows || [];
    }
  }

  clickSquare(square: Square): { action: 'selected' | 'moved' | 'deselected' | 'promotion_opened' | 'locked' } {
    if (this.isBoardLocked) {
      return { action: 'locked' };
    }

    const piece = this.engine.getPiece(square);

    // 1. If currently a square is selected
    if (this.selectedSquare) {
      // Clicking the same square deselects
      if (this.selectedSquare === square) {
        this.selectedSquare = null;
        this.legalMoveTargets = [];
        return { action: 'deselected' };
      }

      // If clicking one of the legal targets
      if (this.legalMoveTargets.includes(square)) {
        const fromPiece = this.engine.getPiece(this.selectedSquare);
        const [toR] = ChessEngineHarness.squareToCoords(square);

        // Check for promotion
        if (fromPiece?.type === 'p' && (toR === 0 || toR === 7)) {
          this.isPromotionModalOpen = true;
          this.pendingPromotion = { from: this.selectedSquare, to: square };
          return { action: 'promotion_opened' };
        }

        const success = this.executeMove(this.selectedSquare, square);
        this.selectedSquare = null;
        this.legalMoveTargets = [];
        return success ? { action: 'moved' } : { action: 'deselected' };
      }

      // If clicking another piece of the active player, switch selection
      if (piece && piece.color === this.engine.activeColor) {
        this.selectedSquare = square;
        this.legalMoveTargets = this.engine.getLegalMovesForSquare(square);
        return { action: 'selected' };
      }

      // Clicking empty or enemy square not in legal targets
      this.selectedSquare = null;
      this.legalMoveTargets = [];
      return { action: 'deselected' };
    }

    // 2. No square previously selected
    if (piece && piece.color === this.engine.activeColor) {
      this.selectedSquare = square;
      this.legalMoveTargets = this.engine.getLegalMovesForSquare(square);
      return { action: 'selected' };
    }

    return { action: 'deselected' };
  }

  dragAndDrop(from: Square, to: Square): boolean {
    if (this.isBoardLocked || !this.arePiecesDraggable) return false;
    const legalTargets = this.engine.getLegalMovesForSquare(from);
    if (!legalTargets.includes(to)) return false;

    const piece = this.engine.getPiece(from);
    const [toR] = ChessEngineHarness.squareToCoords(to);

    if (piece?.type === 'p' && (toR === 0 || toR === 7)) {
      this.isPromotionModalOpen = true;
      this.pendingPromotion = { from, to };
      return true;
    }

    return this.executeMove(from, to);
  }

  confirmPromotion(chosenPiece: PieceType): boolean {
    if (!this.pendingPromotion) return false;
    const { from, to } = this.pendingPromotion;
    this.isPromotionModalOpen = false;
    this.pendingPromotion = null;
    return this.executeMove(from, to, chosenPiece);
  }

  private executeMove(from: Square, to: Square, promotion?: PieceType): boolean {
    if (this.onMoveAttempt) {
      const allowed = this.onMoveAttempt(from, to, promotion);
      if (!allowed) return false;
    }
    this.engine.makeMove(from, to, promotion);
    this.updateHighlightStyles(from, to);
    return true;
  }

  private updateHighlightStyles(from: Square, to: Square): void {
    this.squareStyles = {
      [from]: { backgroundColor: 'rgba(250, 204, 21, 0.35)' },
      [to]: { backgroundColor: 'rgba(250, 204, 21, 0.45)' },
    };
    if (this.engine.isCheck()) {
      const kingCoords = this.engine.findKing(this.engine.activeColor);
      if (kingCoords) {
        const kingSq = ChessEngineHarness.coordsToSquare(kingCoords[0], kingCoords[1]);
        this.squareStyles[kingSq] = {
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          boxShadow: '0 0 12px rgba(239, 68, 68, 1)',
        };
      }
    }
  }

  handleKeyDown(key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'): void {
    if (!this.currentNodeId) return;
    const current = this.treeNodes.get(this.currentNodeId);
    if (!current) return;

    switch (key) {
      case 'ArrowRight': {
        // Step forward along main branch
        if (current.children.length > 0) {
          this.navigateToNode(current.children[0]);
        }
        break;
      }
      case 'ArrowLeft': {
        // Step back
        if (current.parentId && this.treeNodes.has(current.parentId)) {
          this.navigateToNode(current.parentId);
        }
        break;
      }
      case 'ArrowDown': {
        // Next sibling branch
        if (current.parentId) {
          const parent = this.treeNodes.get(current.parentId);
          if (parent) {
            const idx = parent.children.indexOf(current.id);
            if (idx >= 0 && idx + 1 < parent.children.length) {
              this.navigateToNode(parent.children[idx + 1]);
            }
          }
        }
        break;
      }
      case 'ArrowUp': {
        // Prev sibling branch
        if (current.parentId) {
          const parent = this.treeNodes.get(current.parentId);
          if (parent) {
            const idx = parent.children.indexOf(current.id);
            if (idx > 0) {
              this.navigateToNode(parent.children[idx - 1]);
            }
          }
        }
        break;
      }
      case 'Home': {
        if (this.rootNodeId) {
          this.navigateToNode(this.rootNodeId);
        }
        break;
      }
      case 'End': {
        let node = current;
        while (node.children.length > 0) {
          const next = this.treeNodes.get(node.children[0]);
          if (!next) break;
          node = next;
        }
        this.navigateToNode(node.id);
        break;
      }
    }
  }

  navigateToNode(nodeId: string): void {
    const node = this.treeNodes.get(nodeId);
    if (!node) return;
    this.currentNodeId = nodeId;
    this.engine.loadFen(node.fen);
    this.arrows = node.arrows || [];
    this.selectedSquare = null;
    this.legalMoveTargets = [];
  }
}
