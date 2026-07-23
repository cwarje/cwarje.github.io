import type { PlayerColor, UpRiverBiddingStyle, UpRiverStartMode } from '../../networking/types';

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

export type UpRiverPhase = 'bidding' | 'bid-countdown' | 'bid-reveal' | 'playing' | 'round-end';

export interface UpRiverState {
  players: UpRiverPlayer[];
  phase: UpRiverPhase;
  upRiverStartMode: UpRiverStartMode;
  upRiverBiddingStyle: UpRiverBiddingStyle;
  allowPerfectBids: boolean;
  submittedBids: Record<string, number>;
  bidCountdown: number;
  roundSequence: number[];
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
  | { type: 'tick-bid-countdown' }
  | { type: 'finish-bid-countdown' }
  | { type: 'finish-bid-reveal' }
  | { type: 'play-card'; card: Card }
  | { type: 'resolve-trick' }
  | { type: 'start-next-round' };
