import type { PlayerColor } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface CucumberPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  penaltyScore: number;
  eliminated: boolean;
}

export type CucumberPhase = 'playing' | 'hand-end' | 'game-over';

export interface CucumberState {
  players: CucumberPlayer[];
  phase: CucumberPhase;
  handNumber: number;
  dealerIndex: number;
  /** Player ids in clockwise play order for the current hand (active players only). */
  handPlayerIds: string[];
  currentPlayerIndex: number;
  currentTrick: { playerId: string; card: Card }[];
  trickNumber: number;
  trickWinner: string | null;
  lastHandPenalty: { playerId: string; points: number } | null;
  gameOver: boolean;
  winners: string[];
  eliminationThreshold: 30 | 50;
}

export type CucumberAction =
  | { type: 'play-card'; card: Card }
  | { type: 'resolve-trick' }
  | { type: 'start-next-hand' };

export const ELIMINATION_THRESHOLD = 30;
export const CARDS_PER_HAND = 7;
