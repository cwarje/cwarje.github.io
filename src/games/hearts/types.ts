import type { HeartsTargetScore, PlayerColor } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface HeartsPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  tricksTaken: Card[][];
  roundScore: number;
  totalScore: number;
}

export type PassDirection = 'left' | 'right' | 'across' | 'none';

export interface HeartsState {
  players: HeartsPlayer[];
  targetScore: HeartsTargetScore;
  phase: 'passing' | 'playing' | 'round-end';
  passDirection: PassDirection;
  passSelections: Record<string, Card[]>; // playerId -> cards selected to pass
  passConfirmed: Record<string, boolean>; // playerId -> whether they confirmed their pass
  currentTrick: { playerId: string; card: Card }[];
  currentPlayerIndex: number;
  leadPlayerIndex: number;
  heartsBroken: boolean;
  trickNumber: number;
  roundNumber: number;
  gameOver: boolean;
  winner: string | null;
  trickWinner: string | null; // playerId of trick winner, set when trick is complete but not yet resolved
}

export type HeartsAction =
  | { type: 'select-pass'; cards: Card[] }
  | { type: 'confirm-pass' }
  | { type: 'play-card'; card: Card }
  | { type: 'resolve-trick' };
