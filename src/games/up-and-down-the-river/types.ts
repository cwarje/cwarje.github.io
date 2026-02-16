import type { PlayerColor } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface UpRiverPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  bid: number | null;
  tricksWon: number;
  roundScore: number;
  totalScore: number;
}

export type UpRiverPhase = 'bidding' | 'playing' | 'round-end';

export interface UpRiverState {
  players: UpRiverPlayer[];
  phase: UpRiverPhase;
  roundIndex: number;
  currentRoundCardCount: number;
  dealerIndex: number;
  leaderIndex: number;
  currentPlayerIndex: number;
  currentTrick: { playerId: string; card: Card }[];
  trickWinner: string | null;
  trickNumber: number;
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  gameOver: boolean;
  winner: string | null;
}

export type UpRiverAction =
  | { type: 'place-bid'; bid: number }
  | { type: 'play-card'; card: Card }
  | { type: 'resolve-trick' };
