import type { PlayerColor } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface TableSlot {
  card: Card;
  faceUp: boolean;
}

export interface GolfPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  /** Six cards in row-major 2×3 order (indices 0–2 top row, 3–5 bottom row). */
  table: TableSlot[];
  totalScore: number;
}

export type GolfPhase = 'playing' | 'hole-end' | 'game-over';

export const TABLE_SLOT_COUNT = 6;
export const TOTAL_HOLES = 9;

export interface GolfState {
  players: GolfPlayer[];
  stock: Card[];
  discard: Card[];
  currentPlayerIndex: number;
  holeNumber: number;
  phase: GolfPhase;
  pendingDraw: Card | null;
  pendingDrawSource: 'stock' | 'discard' | null;
  endingRound: boolean;
  finalTurnsLeft: number;
  holeScores: Record<string, number>;
  holeSummary: string;
  gameOver: boolean;
  winners: string[];
}

export type GolfAction =
  | { type: 'draw-from-stock' }
  | { type: 'take-discard' }
  | { type: 'swap-with-slot'; slotIndex: number }
  | { type: 'discard-drawn' }
  | { type: 'start-next-hole' };
