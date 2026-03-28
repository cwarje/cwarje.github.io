import type { PlayerColor } from '../../networking/types';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Build {
  cards: Card[];
  value: number;
  ownerId: string;
  /** Number of independent groups stacked at the same declared value (1 = single, 2 = double, etc.). */
  groupCount: number;
}

export function buildMultiplicityLabel(build: Build): string {
  if (build.groupCount <= 1) return String(build.value);
  if (build.groupCount === 2) return `D${build.value}`;
  if (build.groupCount === 3) return `T${build.value}`;
  return `${build.groupCount}x${build.value}`;
}

export type TableItem =
  | { kind: 'card'; card: Card }
  | { kind: 'build'; build: Build };

export type TableSlot = TableItem | null;
export const BYGG_TABLE_COLUMNS = 4;

/** While set, `playedCard` is not in that player's `hand` (removed until finalize or abort). */
export interface PendingCapturePreview {
  playerId: string;
  playedCard: Card;
  capturedSlotIndices: number[];
}

export interface ByggkasinoPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  hand: Card[];
  capturedCards: Card[];
  sweepCount: number;
}

export type ByggkasinoPhase = 'playing' | 'announcement' | 'table-remnant' | 'round-end' | 'game-over';

/** Shown in the heads-up strip during phase `announcement` (host timer clears it). */
export type ByggkasinoActionAnnouncement =
  | {
      kind: 'capture';
      playerId: string;
      /** Every card taken: played card first, then table cards / build cards. */
      capturedCards: Card[];
      sweep: boolean;
      /** True if any captured table item was a build pile. */
      capturedBuild: boolean;
    }
  | {
      kind: 'build';
      playerId: string;
      playedCard: Card;
      declaredValue: number;
      /** Played card first, then loose table cards (same order as the resulting build pile). */
      buildCards: Card[];
    }
  | { kind: 'extend-build'; playerId: string; playedCard: Card; declaredValue: number }
  | { kind: 'trail'; playerId: string; playedCard: Card };

export interface RoundScoreBreakdown {
  mostCards: number;
  mostSpades: number;
  bigCasino: number;
  littleCasino: number;
  aces: number;
  sweeps: number;
  /** +1 for the player who made the last capture this round (not last trail). */
  lastCapture: number;
  total: number;
}

export interface ByggkasinoState {
  players: ByggkasinoPlayer[];
  deck: Card[];
  tableSlots: TableSlot[];
  tableRows: number;
  currentPlayerIndex: number;
  dealerIndex: number;
  phase: ByggkasinoPhase;
  roundNumber: number;
  /** 1-based count of 4-card deals within the current scoring round (resets each round). */
  dealNumberInRound: number;
  lastCapturerIndex: number;
  /** Cumulative scores across rounds, keyed by player id. */
  scores: Record<string, number>;
  /** Per-round score breakdown from the most recent round, keyed by player id. */
  lastRoundScores: Record<string, RoundScoreBreakdown>;
  targetScore: number;
  gameOver: boolean;
  winners: string[];
  actionAnnouncement: ByggkasinoActionAnnouncement | null;
  pendingCapturePreview: PendingCapturePreview | null;
}

export type ByggkasinoAction =
  | { type: 'capture-preview'; playedCard: Card; capturedSlotIndices: number[] }
  | { type: 'finalize-capture' }
  | { type: 'group-table'; tableCardIndices: number[]; declaredValue: number; playedCard?: Card }
  | { type: 'build'; playedCard: Card; tableCardIndices: number[]; declaredValue: number }
  | { type: 'extend-build'; playedCard: Card; buildIndex: number; declaredValue: number }
  | { type: 'trail'; playedCard: Card; targetSlotIndex: number }
  | { type: 'start-next-round' }
  | { type: 'finish-action-announcement' }
  | { type: 'finish-table-remnant' };

/** Legal numerical contributions for sums, builds, and matching build values when capturing. */
export function cardValuesForSum(card: Card): readonly number[] {
  if (card.rank === 1) return [1, 14];
  if (card.rank === 11) return [11];
  if (card.rank === 12) return [12];
  if (card.rank === 13) return [13];
  if (card.suit === 'spades' && card.rank === 2) return [2, 15];
  if (card.suit === 'diamonds' && card.rank === 10) return [10, 16];
  if (card.rank >= 2 && card.rank <= 10) return [card.rank];
  return [card.rank];
}

/** Every card may participate in builds and sum-captures under current rules. */
export function canParticipateInBuildOrSum(_card: Card): boolean {
  return true;
}

export function playedCardMatchesBuildValue(card: Card, buildValue: number): boolean {
  return cardValuesForSum(card).includes(buildValue);
}

/** Loose card counts as a single-card capture for this target value. */
export function cardIsSingleMatchForTarget(card: Card, target: number): boolean {
  return cardValuesForSum(card).includes(target) || card.rank === target;
}

/** Minimum declared value for a build (used for sorting / bot heuristics). */
export function minCardValueForSum(card: Card): number {
  const v = cardValuesForSum(card);
  return Math.min(...v);
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function rankDisplay(rank: Rank): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function countOccupiedTableSlots(tableSlots: TableSlot[]): number {
  return tableSlots.filter(Boolean).length;
}

/** House rule: 5♠ always sweeps the table when played (captures all table cards; on an empty table, captures itself for a sweep point). */
export function isFiveOfSpadesSweepCard(card: Card): boolean {
  return card.suit === 'spades' && card.rank === 5;
}

export function occupiedTableSlotIndices(tableSlots: TableSlot[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < tableSlots.length; i++) {
    if (tableSlots[i] != null) out.push(i);
  }
  return out;
}
