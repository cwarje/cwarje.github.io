import type { PlayerColor } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface CrossCribPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  totalScore: number;
}

export type CrossCribPhase = 'playing' | 'round-end' | 'game-over';

/** Grid is 5x5. Index [row][col]. Center (2,2) is starter. */
export type GridCell = { card: Card; playerId: string } | null;

export interface CrossCribState {
  players: CrossCribPlayer[];
  phase: CrossCribPhase;
  roundNumber: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  /** 5x5 grid. grid[2][2] is the starter card (dealt at round start). */
  grid: GridCell[][];
  /** Starter card in center - used for scoring both row 2 and col 2. */
  starterCard: Card | null;
  /** Live scores for each row (0-4). */
  rowScores: number[];
  /** Live scores for each column (0-4). */
  columnScores: number[];
  /** Round summary text for HUD during round-end. */
  roundSummary: string;
  gameOver: boolean;
  winners: string[];
}

export type CrossCribAction =
  | { type: 'place-card'; card: Card; row: number; col: number }
  | { type: 'start-next-round' }
  | { type: 'show-final-results' };
