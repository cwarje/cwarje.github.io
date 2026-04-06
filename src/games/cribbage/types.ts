import type { PlayerColor } from '../../networking/types';
import type { Card } from '../cross-crib/types';

export type { Card };
export type CribbagePhase =
  | 'crib-discard'
  | 'cut-starter'
  | 'pegging'
  | 'show'
  | 'game-over';

export interface CribbagePlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
}

/** Pegging play record (sequence on table). */
export interface PeggingPlay {
  card: Card;
  playerIndex: number;
}

/** Two-phase “go” after a street-ending pass; host advances via timer. */
export type CribbagePeggingGoReveal =
  | { stage: 'announce'; passerIndex: number }
  | {
      stage: 'score';
      passerIndex: number;
      lastCardScorerIndex: number | null;
      lastCardPoints: number;
    };

/** Pause after a pegging play that scores; host advances via timer. */
export interface CribbagePeggingPointsReveal {
  scorerIndex: number;
  points: number;
  summaryParts: string[];
  hit31: boolean;
}

/** Pause after last pegging card (hand empty); +1 last card already applied; then show phase. */
export interface CribbagePeggingHandEndReveal {
  scorerIndex: number;
}

export interface CribbageState {
  players: CribbagePlayer[];
  phase: CribbagePhase;
  dealerIndex: number;
  targetScore: 61 | 121;
  /** Individual peg scores (2–3 players). */
  playerScores: number[];
  /** Team peg scores for 4-player partnership (team 0 = seats 0&2, team 1 = seats 1&3). */
  teamScores: [number, number] | null;

  cribCards: Card[];
  /** 3p only: one card placed in crib before discards. */
  cribSeedCard: Card | null;

  cribSelections: Record<string, Card[]>;
  cribConfirmed: Record<string, boolean>;

  /** Stock after deal + crib; index 0 = top of pack (first card pone would lift in UI). Starter = stock[cutIndex]. */
  stock: Card[];
  starterCard: Card | null;

  /** Snapshot of each hole (4 cards) when pegging begins — used for the show. */
  holeCards: Card[][] | null;

  peggingSequence: PeggingPlay[];
  peggingRunningTotal: number;
  /** Whose turn to play or pass during pegging. */
  peggingCurrentIndex: number;
  consecutivePeggingPasses: number;
  /** Index of last player who played a card this street (for last-card point). */
  lastPeggingPlayerIndex: number | null;

  peggingGoReveal: CribbagePeggingGoReveal | null;
  peggingPointsReveal: CribbagePeggingPointsReveal | null;
  peggingHandEndReveal: CribbagePeggingHandEndReveal | null;

  /** Legacy counter; prefer showAppliedSteps. */
  showStep: number;
  /**
   * Show counting: after pegging, first hand is applied immediately (typically starts at 1). 1..n = that many hands scored (pone order);
   * n = all hands scored, crib not yet; n+1 = crib scored; next advance deals (still `phase: 'show'` until then).
   */
  showAppliedSteps: number;

  gameOver: boolean;
  winners: string[];
}

export type CribbageAction =
  | { type: 'select-crib-discard'; cards: Card[] }
  | { type: 'confirm-crib-discard' }
  | { type: 'perform-cut'; cutIndex: number }
  | { type: 'play-pegging-card'; card: Card }
  | { type: 'pegging-pass' }
  | { type: 'advance-pegging-go-reveal' }
  | { type: 'advance-pegging-points-reveal' }
  | { type: 'advance-pegging-hand-end-reveal' }
  | { type: 'advance-show' }
  | { type: 'start-next-hand' };

export function cribCardsToSelect(playerCount: number): number {
  return playerCount === 2 ? 2 : 1;
}

export function cardsDealtPerPlayer(playerCount: number): number {
  return playerCount === 2 ? 6 : 5;
}

export function poneIndex(dealerIndex: number, playerCount: number): number {
  return (dealerIndex + 1) % playerCount;
}

export function teamIndexForSeat(seat: number): 0 | 1 {
  return seat % 2 === 0 ? 0 : 1;
}
