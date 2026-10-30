/**
 * Standalone chess logic engine harness for independent E2E validation.
 * Complies with FIDE rules, standard FEN specifications, SAN notation, and Vukovic game logic.
 */

export type Square =
  | 'a8' | 'b8' | 'c8' | 'd8' | 'e8' | 'f8' | 'g8' | 'h8'
  | 'a7' | 'b7' | 'c7' | 'd7' | 'e7' | 'f7' | 'g7' | 'h7'
  | 'a6' | 'b6' | 'c6' | 'd6' | 'e6' | 'f6' | 'g6' | 'h6'
  | 'a5' | 'b5' | 'c5' | 'd5' | 'e5' | 'f5' | 'g5' | 'h5'
  | 'a4' | 'b4' | 'c4' | 'd4' | 'e4' | 'f4' | 'g4' | 'h4'
  | 'a3' | 'b3' | 'c3' | 'd3' | 'e3' | 'f3' | 'g3' | 'h3'
  | 'a2' | 'b2' | 'c2' | 'd2' | 'e2' | 'f2' | 'g2' | 'h2'
  | 'a1' | 'b1' | 'c1' | 'd1' | 'e1' | 'f1' | 'g1' | 'h1';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface ParsedMove {
  from: Square;
  to: Square;
  promotion?: PieceType;
  san: string;
  uci: string;
  piece: Piece;
  captured?: Piece;
  isCheck?: boolean;
  isCheckmate?: boolean;
}

export class ChessEngineHarness {
  private board: (Piece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
  public activeColor: PieceColor = 'w';
  public castlingRights: string = 'KQkq';
  public enPassantTarget: Square | null = null;
  public halfmoveClock: number = 0;
  public fullmoveNumber: number = 1;

  constructor(fen?: string) {
    if (fen) {
      this.loadFen(fen);
    } else {
      this.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    }
  }

  static squareToCoords(square: Square): [number, number] {
    if (!square || typeof square !== 'string' || square.length !== 2) {
      throw new Error(`Invalid square coordinate: ${square}`);
    }
    const file = square.charCodeAt(0) - 97; // a -> 0
    const rank = 8 - parseInt(square[1], 10); // 8 -> 0, 1 -> 7
    if (file < 0 || file > 7 || rank < 0 || rank > 7) {
      throw new Error(`Square coordinate out of bounds: ${square}`);
    }
    return [rank, file];
  }

  static coordsToSquare(rank: number, file: number): Square {
    const fileChar = String.fromCharCode(97 + file);
    const rankChar = String(8 - rank);
    return `${fileChar}${rankChar}` as Square;
  }

  loadFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) {
      throw new Error(`Invalid FEN string: ${fen}`);
    }

    const rows = parts[0].split('/');
    if (rows.length !== 8) {
      throw new Error(`Invalid FEN board rows count: ${rows.length}`);
    }

    this.board = Array(8).fill(null).map(() => Array(8).fill(null));

    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const char of rows[r]) {
        if (/[1-8]/.test(char)) {
          c += parseInt(char, 10);
        } else {
          const color: PieceColor = char === char.toUpperCase() ? 'w' : 'b';
          const type = char.toLowerCase() as PieceType;
          this.board[r][c] = { type, color };
          c++;
        }
      }
      if (c !== 8) {
        throw new Error(`Invalid FEN row width at row ${r}: got ${c} squares`);
      }
    }

    this.activeColor = parts[1] === 'b' ? 'b' : 'w';
    this.castlingRights = parts[2] || '-';
    this.enPassantTarget = parts[3] !== '-' ? (parts[3] as Square) : null;
    this.halfmoveClock = parts[4] ? parseInt(parts[4], 10) : 0;
    this.fullmoveNumber = parts[5] ? parseInt(parts[5], 10) : 1;
  }

  getFen(): string {
    const rows: string[] = [];
    for (let r = 0; r < 8; r++) {
      let emptyCount = 0;
      let rowStr = '';
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          const char = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
          rowStr += char;
        }
      }
      if (emptyCount > 0) {
        rowStr += emptyCount;
      }
      rows.push(rowStr);
    }

    const ep = this.enPassantTarget || '-';
    return `${rows.join('/')} ${this.activeColor} ${this.castlingRights} ${ep} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  getPiece(square: Square): Piece | null {
    const [r, c] = ChessEngineHarness.squareToCoords(square);
    return this.board[r][c];
  }

  findKing(color: PieceColor): [number, number] | null {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type === 'k' && p.color === color) {
          return [r, c];
        }
      }
    }
    return null;
  }

  isSquareAttacked(square: Square, byColor: PieceColor): boolean {
    const [targetR, targetC] = ChessEngineHarness.squareToCoords(square);

    // Knight attacks
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightOffsets) {
      const r = targetR + dr;
      const c = targetC + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = this.board[r][c];
        if (p && p.color === byColor && p.type === 'n') return true;
      }
    }

    // Pawn attacks
    const pawnDir = byColor === 'w' ? 1 : -1; // white attacks downwards in board coordinates
    const pR = targetR + pawnDir;
    for (const pC of [targetC - 1, targetC + 1]) {
      if (pR >= 0 && pR < 8 && pC >= 0 && pC < 8) {
        const p = this.board[pR][pC];
        if (p && p.color === byColor && p.type === 'p') return true;
      }
    }

    // King attacks
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = targetR + dr;
        const c = targetC + dc;
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
          const p = this.board[r][c];
          if (p && p.color === byColor && p.type === 'k') return true;
        }
      }
    }

    // Ray attacks: orthogonal (R, Q)
    const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of ortho) {
      let r = targetR + dr;
      let c = targetC + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = this.board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // Ray attacks: diagonal (B, Q)
    const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diag) {
      let r = targetR + dr;
      let c = targetC + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = this.board[r][c];
        if (p) {
          if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    return false;
  }

  isCheck(color: PieceColor = this.activeColor): boolean {
    const kingCoords = this.findKing(color);
    if (!kingCoords) return false;
    const enemyColor: PieceColor = color === 'w' ? 'b' : 'w';
    const kingSquare = ChessEngineHarness.coordsToSquare(kingCoords[0], kingCoords[1]);
    return this.isSquareAttacked(kingSquare, enemyColor);
  }

  getLegalMovesForSquare(square: Square): Square[] {
    const [r, c] = ChessEngineHarness.squareToCoords(square);
    const piece = this.board[r][c];
    if (!piece || piece.color !== this.activeColor) return [];

    const pseudoMoves: [number, number][] = [];
    const color = piece.color;
    const enemyColor: PieceColor = color === 'w' ? 'b' : 'w';

    switch (piece.type) {
      case 'p': {
        const dir = color === 'w' ? -1 : 1;
        const startRank = color === 'w' ? 6 : 1;
        // 1 step forward
        if (r + dir >= 0 && r + dir < 8 && !this.board[r + dir][c]) {
          pseudoMoves.push([r + dir, c]);
          // 2 steps forward
          if (r === startRank && !this.board[r + 2 * dir][c]) {
            pseudoMoves.push([r + 2 * dir, c]);
          }
        }
        // Diagonals
        for (const dc of [-1, 1]) {
          const tr = r + dir;
          const tc = c + dc;
          if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            const targetP = this.board[tr][tc];
            if (targetP && targetP.color === enemyColor) {
              pseudoMoves.push([tr, tc]);
            } else if (this.enPassantTarget) {
              const epCoords = ChessEngineHarness.squareToCoords(this.enPassantTarget);
              if (tr === epCoords[0] && tc === epCoords[1]) {
                pseudoMoves.push([tr, tc]);
              }
            }
          }
        }
        break;
      }

      case 'n': {
        const knightOffsets = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of knightOffsets) {
          const tr = r + dr;
          const tc = c + dc;
          if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            const tp = this.board[tr][tc];
            if (!tp || tp.color === enemyColor) {
              pseudoMoves.push([tr, tc]);
            }
          }
        }
        break;
      }

      case 'b':
      case 'r':
      case 'q': {
        const directions: [number, number][] = [];
        if (piece.type === 'b' || piece.type === 'q') {
          directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        }
        if (piece.type === 'r' || piece.type === 'q') {
          directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        }
        for (const [dr, dc] of directions) {
          let tr = r + dr;
          let tc = c + dc;
          while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
            const tp = this.board[tr][tc];
            if (!tp) {
              pseudoMoves.push([tr, tc]);
            } else {
              if (tp.color === enemyColor) pseudoMoves.push([tr, tc]);
              break;
            }
            tr += dr;
            tc += dc;
          }
        }
        break;
      }

      case 'k': {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const tr = r + dr;
            const tc = c + dc;
            if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
              const tp = this.board[tr][tc];
              if (!tp || tp.color === enemyColor) {
                pseudoMoves.push([tr, tc]);
              }
            }
          }
        }

        // Castling
        if (!this.isCheck(color)) {
          if (color === 'w') {
            if (this.castlingRights.includes('K') && !this.board[7][5] && !this.board[7][6]) {
              if (!this.isSquareAttacked('f1', 'b') && !this.isSquareAttacked('g1', 'b')) {
                pseudoMoves.push([7, 6]);
              }
            }
            if (this.castlingRights.includes('Q') && !this.board[7][1] && !this.board[7][2] && !this.board[7][3]) {
              if (!this.isSquareAttacked('d1', 'b') && !this.isSquareAttacked('c1', 'b')) {
                pseudoMoves.push([7, 2]);
              }
            }
          } else {
            if (this.castlingRights.includes('k') && !this.board[0][5] && !this.board[0][6]) {
              if (!this.isSquareAttacked('f8', 'w') && !this.isSquareAttacked('g8', 'w')) {
                pseudoMoves.push([0, 6]);
              }
            }
            if (this.castlingRights.includes('q') && !this.board[0][1] && !this.board[0][2] && !this.board[0][3]) {
              if (!this.isSquareAttacked('d8', 'w') && !this.isSquareAttacked('c8', 'w')) {
                pseudoMoves.push([0, 2]);
              }
            }
          }
        }
        break;
      }
    }

    // Filter out moves that leave own king in check
    const legal: Square[] = [];
    for (const [tr, tc] of pseudoMoves) {
      const backupFen = this.getFen();
      const targetSq = ChessEngineHarness.coordsToSquare(tr, tc);
      try {
        this.makeMoveInternal(square, targetSq);
        if (!this.isCheck(color)) {
          legal.push(targetSq);
        }
      } catch {
        // illegal
      } finally {
        this.loadFen(backupFen);
      }
    }

    return legal;
  }

  getAllLegalMoves(): { from: Square; to: Square }[] {
    const moves: { from: Square; to: Square }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = ChessEngineHarness.coordsToSquare(r, c);
        const p = this.board[r][c];
        if (p && p.color === this.activeColor) {
          const targets = this.getLegalMovesForSquare(sq);
          for (const target of targets) {
            moves.push({ from: sq, to: target });
          }
        }
      }
    }
    return moves;
  }

  isCheckmate(): boolean {
    return this.isCheck(this.activeColor) && this.getAllLegalMoves().length === 0;
  }

  isStalemate(): boolean {
    return !this.isCheck(this.activeColor) && this.getAllLegalMoves().length === 0;
  }

  isGameOver(): boolean {
    return this.isCheckmate() || this.isStalemate();
  }

  private makeMoveInternal(from: Square, to: Square, promotion?: PieceType): ParsedMove {
    const [fromR, fromC] = ChessEngineHarness.squareToCoords(from);
    const [toR, toC] = ChessEngineHarness.squareToCoords(to);
    const piece = this.board[fromR][fromC];
    if (!piece) throw new Error(`No piece at ${from}`);

    let captured = this.board[toR][toC] || undefined;

    // En passant capture
    if (piece.type === 'p' && this.enPassantTarget === to && !captured) {
      const epCaptureR = piece.color === 'w' ? toR + 1 : toR - 1;
      captured = this.board[epCaptureR][toC] || undefined;
      this.board[epCaptureR][toC] = null;
    }

    // Castling rook move
    if (piece.type === 'k' && Math.abs(toC - fromC) === 2) {
      if (toC === 6) { // Kingside
        const rook = this.board[fromR][7];
        this.board[fromR][7] = null;
        this.board[fromR][5] = rook;
      } else if (toC === 2) { // Queenside
        const rook = this.board[fromR][0];
        this.board[fromR][0] = null;
        this.board[fromR][3] = rook;
      }
    }

    // Move piece
    this.board[fromR][fromC] = null;
    let finalPiece = piece;
    if (piece.type === 'p' && (toR === 0 || toR === 7)) {
      finalPiece = { type: promotion || 'q', color: piece.color };
    }
    this.board[toR][toC] = finalPiece;

    // Update en passant
    if (piece.type === 'p' && Math.abs(toR - fromR) === 2) {
      const epRank = (fromR + toR) / 2;
      this.enPassantTarget = ChessEngineHarness.coordsToSquare(epRank, fromC);
    } else {
      this.enPassantTarget = null;
    }

    // Update castling rights
    if (piece.type === 'k') {
      if (piece.color === 'w') {
        this.castlingRights = this.castlingRights.replace(/[KQ]/g, '');
      } else {
        this.castlingRights = this.castlingRights.replace(/[kq]/g, '');
      }
    } else if (piece.type === 'r') {
      if (from === 'h1') this.castlingRights = this.castlingRights.replace('K', '');
      if (from === 'a1') this.castlingRights = this.castlingRights.replace('Q', '');
      if (from === 'h8') this.castlingRights = this.castlingRights.replace('k', '');
      if (from === 'a8') this.castlingRights = this.castlingRights.replace('q', '');
    }
    if (this.castlingRights === '') this.castlingRights = '-';

    // Switch color
    this.activeColor = this.activeColor === 'w' ? 'b' : 'w';
    if (this.activeColor === 'w') {
      this.fullmoveNumber++;
    }

    const uci = `${from}${to}${promotion || ''}`;
    const san = `${piece.type.toUpperCase() !== 'P' ? piece.type.toUpperCase() : ''}${to}`;

    return {
      from,
      to,
      promotion,
      san,
      uci,
      piece,
      captured,
      isCheck: this.isCheck(this.activeColor),
      isCheckmate: false,
    };
  }

  makeMove(from: Square, to: Square, promotion?: PieceType): ParsedMove {
    const legalTargets = this.getLegalMovesForSquare(from);
    if (!legalTargets.includes(to)) {
      throw new Error(`Illegal move: ${from} to ${to}`);
    }
    const move = this.makeMoveInternal(from, to, promotion);
    move.isCheckmate = this.isCheckmate();
    return move;
  }

  /**
   * Parse standard SAN move (e.g. "Bxh7+", "Ng5+", "Kg6", "h4!", "18.Kd2#", "O-O-O#")
   * and apply it.
   */
  makeSanMove(rawSan: string): ParsedMove {
    const cleanSan = rawSan.replace(/^[0-9]+\.+/, '').replace(/[!?+#\s]/g, '');

    // Castling
    if (cleanSan === 'O-O' || cleanSan === '0-0') {
      const from = (this.activeColor === 'w' ? 'e1' : 'e8') as Square;
      const to = (this.activeColor === 'w' ? 'g1' : 'g8') as Square;
      return this.makeMove(from, to);
    }
    if (cleanSan === 'O-O-O' || cleanSan === '0-0-0') {
      const from = (this.activeColor === 'w' ? 'e1' : 'e8') as Square;
      const to = (this.activeColor === 'w' ? 'c1' : 'c8') as Square;
      return this.makeMove(from, to);
    }

    // Match pawn moves like "h4", "e5", "fxe6"
    const pawnMatch = cleanSan.match(/^([a-h])?(?:x)?([a-h][1-8])(?:=([QRBNqrbn]))?$/);
    if (pawnMatch) {
      const sourceFile = pawnMatch[1];
      const targetSq = pawnMatch[2] as Square;
      const promotion = (pawnMatch[3]?.toLowerCase() as PieceType) || undefined;

      // Find pawn that can reach targetSq
      const candidates: Square[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = ChessEngineHarness.coordsToSquare(r, c);
          const p = this.board[r][c];
          if (p && p.type === 'p' && p.color === this.activeColor) {
            if (!sourceFile || sq.startsWith(sourceFile)) {
              if (this.getLegalMovesForSquare(sq).includes(targetSq)) {
                candidates.push(sq);
              }
            }
          }
        }
      }
      if (candidates.length === 1) {
        return this.makeMove(candidates[0], targetSq, promotion);
      }
      if (candidates.length > 1) {
        throw new Error(`Ambiguous pawn move SAN: ${rawSan} (${candidates.join(', ')})`);
      }
    }

    // Piece move like "Bxh7", "Ng5", "Qd3", "Nbd2", "R1e4"
    const pieceMatch = cleanSan.match(/^([NBRQK])([a-h1-8])?(?:x)?([a-h][1-8])$/);
    if (pieceMatch) {
      const pieceType = pieceMatch[1].toLowerCase() as PieceType;
      const disambiguation = pieceMatch[2];
      const targetSq = pieceMatch[3] as Square;

      const candidates: Square[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = ChessEngineHarness.coordsToSquare(r, c);
          const p = this.board[r][c];
          if (p && p.type === pieceType && p.color === this.activeColor) {
            if (!disambiguation || sq.includes(disambiguation)) {
              if (this.getLegalMovesForSquare(sq).includes(targetSq)) {
                candidates.push(sq);
              }
            }
          }
        }
      }

      if (candidates.length === 1) {
        return this.makeMove(candidates[0], targetSq);
      }
      if (candidates.length > 1) {
        throw new Error(`Ambiguous SAN move: ${rawSan} matching [${candidates.join(', ')}]`);
      }
    }

    throw new Error(`Unrecognized or unsupported SAN move: ${rawSan}`);
  }
}
