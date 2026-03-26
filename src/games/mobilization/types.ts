import type { PlayerColor } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface MobilizationPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  tricksThisRound: number;
  clubsThisRound: number;
  queensThisRound: number;
  hadKingClubs: boolean;
  tookLastTrick: boolean;
  roundScore: number;
  totalScore: number;
}

/** One column in the Solitaire round: middle = 7 anchor, top builds 6→A, bottom 8→K */
export interface SolitaireColumn {
  seven: Card | null;
  topCard: Card | null;
  bottomCard: Card | null;
  /** Next rank required on top (toward ace); null when no 7 or chain finished */
  topNext: Rank | null;
  /** Next rank required below 7; null when no 7 or chain finished */
  bottomNext: Rank | null;
}

export type MobilizationPhase = 'playing' | 'round-end' | 'solitaire';

export interface MobilizationState {
  players: MobilizationPlayer[];
  phase: MobilizationPhase;
  /** 0..5 = six rounds */
  roundIndex: number;
  dealerIndex: number;
  leaderIndex: number;
  currentPlayerIndex: number;
  currentTrick: { playerId: string; card: Card }[];
  trickWinner: string | null;
  trickNumber: number;
  cardsPerTrickRound: number;
  removedCards: Card[];
  gameOver: boolean;
  pigHolderId: string | null;
  solitaireColumns: SolitaireColumn[];
}

export type MobilizationAction =
  | { type: 'play-card'; card: Card }
  | { type: 'resolve-trick' }
  | { type: 'start-next-round' }
  | { type: 'solitaire-play'; card: Card; columnIndex: number }
  | { type: 'solitaire-pass' };
