import type { PlayerColor, TensScoreThreshold } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface FrontPile {
  bottomCard: Card | null;
  topCard: Card | null;
  bottomFaceUp: boolean;
}

export interface TensPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  tablePiles: FrontPile[];
  totalScore: number;
}

export type TensPhase = 'playing' | 'reveal-follow-up' | 'announcement' | 'round-end' | 'game-over';

export interface TensRevealFollowUp {
  rank: Rank;
  committedPlays: SelectedCardPlay[];
}

export type TensPlayOutcome = 'normal' | 'pickup' | 'set-clear' | 'wild-clear';

export interface TensActionAnnouncement {
  playerId: string;
  plays: SelectedCardPlay[];
  outcome: TensPlayOutcome;
  /** Center pile contents after cards were played, before pickup/clear (for fly-out animation). */
  centerAfterPlay: Card[];
  /** Discard pile size before a set/wild clear (for deferring the badge until fly-out completes). */
  discardCountBeforeClear?: number;
}

export type PlaySource = 'hand' | 'pile-top' | 'pile-bottom';

export interface SelectedCardPlay {
  card: Card;
  source: PlaySource;
  pileIndex?: number;
}

export interface TensState {
  players: TensPlayer[];
  phase: TensPhase;
  scoreThreshold: TensScoreThreshold;
  dealerIndex: number;
  currentPlayerIndex: number;
  roundNumber: number;
  centerPile: Card[];
  discardCount: number;
  lastPlayRank: Rank | null;
  extraTurnPending: boolean;
  roundOutPlayerId: string | null;
  lastRoundScores: Record<string, number>;
  roundSummary: string;
  gameOver: boolean;
  winners: string[];
  actionAnnouncement: TensActionAnnouncement | null;
  revealFollowUp: TensRevealFollowUp | null;
}

export type TensAction =
  | { type: 'play-cards'; plays: SelectedCardPlay[] }
  | { type: 'play-reveal-follow-up'; plays: SelectedCardPlay[] }
  | { type: 'skip-reveal-follow-up' }
  | { type: 'finish-action-announcement' }
  | { type: 'start-next-round' }
  | { type: 'show-final-results' };

export const PILES_PER_PLAYER = 4;
export const HAND_CARDS_PER_PLAYER = 12;
export const CARDS_PER_PLAYER = PILES_PER_PLAYER * 2 + HAND_CARDS_PER_PLAYER;
