import { getTrickWinnerPlayerId } from '../up-and-down-the-river/rules';
import type { Card, MobilizationState, Rank, SolitaireColumn, Suit } from './types';

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function isValidMobilizationTrickPlay(state: MobilizationState, playerIndex: number, card: Card): boolean {
  const player = state.players[playerIndex];
  if (!player) return false;
  if (!player.hand.some(c => cardEquals(c, card))) return false;

  if (state.currentTrick.length === 0) return true;

  const leadSuit = state.currentTrick[0].card.suit;
  const hasLeadSuit = player.hand.some(c => c.suit === leadSuit);
  if (hasLeadSuit && card.suit !== leadSuit) return false;
  return true;
}

export function getMobilizationTrickWinnerId(trick: { playerId: string; card: Card }[]): string | null {
  return getTrickWinnerPlayerId(trick, null);
}

/** Ranks in top sequence after 7: 6,5,4,3,2, then Ace (14) as low */
const TOP_SEQUENCE_AFTER_SIX: Rank[] = [5, 4, 3, 2, 14];

function nextTopRankAfterPlay(currentTopRank: Rank): Rank | null {
  if (currentTopRank === 6) return TOP_SEQUENCE_AFTER_SIX[0] ?? null;
  const idx = TOP_SEQUENCE_AFTER_SIX.indexOf(currentTopRank);
  if (idx === -1) return null;
  if (idx >= TOP_SEQUENCE_AFTER_SIX.length - 1) return null;
  return TOP_SEQUENCE_AFTER_SIX[idx + 1] ?? null;
}

/** After placing `playedRank` on top, what is the next required rank? Null = top chain complete */
export function topNextAfterPlacing(_seven: Card, playedRank: Rank): Rank | null {
  if (playedRank === 14) return null;
  if (playedRank === 6) return TOP_SEQUENCE_AFTER_SIX[0] ?? null;
  return nextTopRankAfterPlay(playedRank);
}

export function applySolitaireTopPlay(col: SolitaireColumn, card: Card): SolitaireColumn {
  if (!col.seven || col.seven.suit !== card.suit) return col;
  return {
    ...col,
    topCard: card,
    topNext: topNextAfterPlacing(col.seven, card.rank),
  };
}

export function applySolitaireBottomPlay(col: SolitaireColumn, card: Card): SolitaireColumn {
  if (!col.seven || col.seven.suit !== card.suit) return col;
  const nextRank = (card.rank + 1) as Rank;
  const bottomNext = card.rank >= 13 ? null : nextRank;
  return {
    ...col,
    bottomCard: card,
    bottomNext,
  };
}

export function canPlaySevenOnColumn(col: SolitaireColumn, card: Card): boolean {
  return card.rank === 7 && col.seven === null;
}

export function canPlayOnSolitaireTop(col: SolitaireColumn, card: Card): boolean {
  if (!col.seven || col.topNext === null) return false;
  return card.suit === col.seven.suit && card.rank === col.topNext;
}

export function canPlayOnSolitaireBottom(col: SolitaireColumn, card: Card): boolean {
  if (!col.seven || col.bottomNext === null) return false;
  return card.suit === col.seven.suit && card.rank === col.bottomNext;
}

export interface SolitaireLegalPlay {
  card: Card;
  columnIndex: number;
  row: 'mid' | 'top' | 'bottom';
}

export function getLegalSolitairePlays(
  columns: SolitaireColumn[],
  hand: Card[],
): SolitaireLegalPlay[] {
  const out: SolitaireLegalPlay[] = [];
  for (const card of hand) {
    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const col = columns[colIdx];
      if (canPlaySevenOnColumn(col, card)) {
        out.push({ card, columnIndex: colIdx, row: 'mid' });
        continue;
      }
      if (canPlayOnSolitaireTop(col, card)) {
        out.push({ card, columnIndex: colIdx, row: 'top' });
      }
      if (canPlayOnSolitaireBottom(col, card)) {
        out.push({ card, columnIndex: colIdx, row: 'bottom' });
      }
    }
  }
  return out;
}

export function isValidSolitairePlay(
  columns: SolitaireColumn[],
  card: Card,
  columnIndex: number,
): boolean {
  if (columnIndex < 0 || columnIndex >= columns.length) return false;
  const col = columns[columnIndex];
  return (
    canPlaySevenOnColumn(col, card)
    || canPlayOnSolitaireTop(col, card)
    || canPlayOnSolitaireBottom(col, card)
  );
}

const SUIT_ORDER: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];

export function suitRemovalIndex(suit: Suit): number {
  return SUIT_ORDER.indexOf(suit);
}

/** Lower = removed first (52-card deck trim per round) */
export function removalSortKey(roundIndex: number, card: Card): number {
  const suitI = suitRemovalIndex(card.suit);
  const base = card.rank * 10 + suitI;

  switch (roundIndex) {
    case 0:
    case 5:
      return base;
    case 1:
      return card.suit === 'clubs' ? 1000 + base : base;
    case 2:
      return card.rank === 12 ? 1000 + base : base;
    case 3:
      return card.suit === 'clubs' && card.rank === 13 ? 10000 + base : base;
    case 4:
      return card.rank === 7 ? 10000 + base : base;
    default:
      return base;
  }
}
