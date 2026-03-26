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

/** One column in the Solitaire round: `top*` = 6→A chain, `bottom*` = 8→K (UI draws 8→K above the 7, 6→A below). */
export interface SolitaireColumn {
  seven: Card | null;
  topCard: Card | null;
  bottomCard: Card | null;
  /** Next rank required on top (toward ace); null when no 7 or chain finished */
  topNext: Rank | null;
  /** Next rank required below 7; null when no 7 or chain finished */
  bottomNext: Rank | null;
}

export type MobilizationPhase =
  | 'playing'
  | 'round-depleted'
  | 'round-end'
  | 'solitaire'
  | 'solitaire-reveal';

/** Shown for 3s after each Solitaire play or pig pass (phase `solitaire-reveal`). */
export type SolitaireReveal =
  | {
      kind: 'play';
      actorId: string;
      card: Card;
      columnIndex: number;
      /** Grid row: 0 = top, 1 = seven row, 2 = bottom */
      rowIndex: 0 | 1 | 2;
      roundWinnerId?: string;
    }
  | { kind: 'pass'; actorId: string };

export type MobilizationTrickRoundDepletedKind = 'clubs' | 'queens';

export interface MobilizationState {
  players: MobilizationPlayer[];
  phase: MobilizationPhase;
  /** Set when phase is round-depleted (HUD copy) */
  trickRoundDepletedKind?: MobilizationTrickRoundDepletedKind;
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
  /** Set only while `phase === 'solitaire-reveal'` */
  solitaireReveal?: SolitaireReveal | null;
}

export type MobilizationAction =
  | { type: 'play-card'; card: Card }
  | { type: 'resolve-trick' }
  | { type: 'complete-trick-round-depletion' }
  | { type: 'start-next-round' }
  | { type: 'solitaire-play'; card: Card; columnIndex: number }
  | { type: 'solitaire-pass' }
  | { type: 'solitaire-finish-reveal' }
  | { type: 'dev-jump-round'; roundIndex: number };

export function isMobilizationDevJumpAction(payload: unknown): payload is { type: 'dev-jump-round'; roundIndex: number } {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (p.type !== 'dev-jump-round') return false;
  const r = p.roundIndex;
  return typeof r === 'number' && Number.isInteger(r) && r >= 0 && r <= 5;
}
