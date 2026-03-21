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
  tjogSuitsCalled: Suit[];
}

export type TwelvePhase = 'playing' | 'announcement' | 'flipping' | 'round-end' | 'game-over';
export type PlaySource = 'hand' | 'pile-top' | 'pile-bottom';

export type TwelveManBid = { kind: 'half' | 'full'; playerId: string };
export type TwelveManOutcomeKind = 'half-success' | 'half-fail-streak' | 'half-fail-points' | 'full-success' | 'full-fail';

export type TwelveAnnouncement =
  | {
      kind: 'set-trump' | 'call-tjog';
      playerId: string;
      suit: Suit;
    }
  | {
      kind: 'call-half-man' | 'call-full-man';
      playerId: string;
    }
  | {
      kind: 'man-outcome';
      playerId: string;
      outcome: TwelveManOutcomeKind;
    };

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
  announcement: TwelveAnnouncement | null;
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
  knownVoidSuitsByPlayer: Record<string, Suit[]>;
  roundCardPoints: Record<string, number>;
  roundSummary: string;
  gameOver: boolean;
  winners: string[];
  manBid: TwelveManBid | null;
  postAnnouncement: 'end-round' | null;
}

export type TwelveAction =
  | { type: 'play-hand-card'; card: Card }
  | { type: 'play-pile-card'; pileIndex: number }
  | { type: 'dev-give-best-cards' }
  | { type: 'set-trump'; suit: Suit }
  | { type: 'call-tjog'; suit: Suit }
  | { type: 'call-half-man' }
  | { type: 'call-full-man' }
  | { type: 'finish-announcement' }
  | { type: 'resolve-trick' }
  | { type: 'flip-exposed' }
  | { type: 'start-next-round' }
  | { type: 'show-final-results' };
