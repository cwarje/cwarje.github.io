import type { PlayerColor, TwelvePileCount } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface FrontPile {
  bottomCard: Card | null;
  topCard: Card | null;
  bottomFaceUp: boolean;
}

export interface TwelvePlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  frontPiles: FrontPile[];
  capturedCards: Card[];
  totalScore: number;
  shogSuitsCalled: Suit[];
}

export type TwelvePhase = 'playing' | 'flipping' | 'round-end';
export type PlaySource = 'hand' | 'pile-top' | 'pile-bottom';

export interface TrickPlay {
  playerId: string;
  card: Card;
  source: PlaySource;
  pileIndex?: number;
}

export interface TwelveState {
  players: TwelvePlayer[];
  pileCount: TwelvePileCount;
  phase: TwelvePhase;
  dealerIndex: number;
  leaderIndex: number;
  currentPlayerIndex: number;
  currentTrick: TrickPlay[];
  trickWinner: string | null;
  trickNumber: number;
  trumpSuit: Suit | null;
  trumpSetterId: string | null;
  pendingFlip: { playerId: string; pileIndex: number }[];
  lastTrickWinnerId: string | null;
  roundNumber: number;
  roundCardPoints: Record<string, number>;
  roundSummary: string;
  gameOver: boolean;
  winners: string[];
}

export type TwelveAction =
  | { type: 'play-hand-card'; card: Card }
  | { type: 'play-pile-card'; pileIndex: number }
  | { type: 'set-trump'; suit: Suit }
  | { type: 'call-shog'; suit: Suit }
  | { type: 'resolve-trick' }
  | { type: 'flip-exposed' }
  | { type: 'start-next-round' };
