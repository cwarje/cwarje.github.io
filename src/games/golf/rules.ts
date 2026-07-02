import type { Card, GolfPlayer, GolfState, Rank, TableSlot } from './types';
import { TABLE_SLOT_COUNT } from './types';

export const COLUMN_PAIRS: [number, number][] = [
  [0, 3],
  [1, 4],
  [2, 5],
];

export const SQUARES: [number, number, number, number][] = [
  [0, 1, 3, 4],
  [1, 2, 4, 5],
];

export const SQUARE_BONUS = -20;

function isSameRankSquare(table: TableSlot[], slots: number[]): boolean {
  const first = table[slots[0]!];
  if (!first) return false;
  const rank = first.card.rank;
  return slots.every(i => table[i]?.card.rank === rank);
}

export function squareBonus(table: TableSlot[]): number {
  let bonus = 0;
  for (const square of SQUARES) {
    if (isSameRankSquare(table, square)) {
      bonus += SQUARE_BONUS;
    }
  }
  return bonus;
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function rankDisplay(rank: Rank): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

export function cardPointValue(card: Card): number {
  if (card.rank === 13) return 0;
  if (card.rank === 11 || card.rank === 12) return 10;
  if (card.rank === 14) return 1;
  if (card.rank === 2) return -2;
  return card.rank;
}

export function slotPointValue(table: TableSlot[], slotIndex: number): number {
  const slot = table[slotIndex];
  if (!slot) return 0;
  const columnPair = COLUMN_PAIRS.find(([a, b]) => a === slotIndex || b === slotIndex);
  if (columnPair) {
    const [top, bottom] = columnPair;
    const topSlot = table[top];
    const bottomSlot = table[bottom];
    if (topSlot && bottomSlot && topSlot.card.rank === bottomSlot.card.rank) {
      return 0;
    }
  }
  return cardPointValue(slot.card);
}

export function columnPairScore(table: TableSlot[], columnIndex: number): number {
  const pair = COLUMN_PAIRS[columnIndex];
  if (!pair) return 0;
  const [top, bottom] = pair;
  return slotPointValue(table, top) + slotPointValue(table, bottom);
}

export function scorePlayerTable(player: GolfPlayer): number {
  let total = 0;
  for (let i = 0; i < TABLE_SLOT_COUNT; i++) {
    total += slotPointValue(player.table, i);
  }
  total += squareBonus(player.table);
  return total;
}

export function allTableFaceUp(player: GolfPlayer): boolean {
  return player.table.length === TABLE_SLOT_COUNT && player.table.every(slot => slot.faceUp);
}

export function isCurrentPlayer(state: GolfState, playerId: string): boolean {
  const current = state.players[state.currentPlayerIndex];
  return current?.id === playerId;
}

export function hasFaceDownSlots(player: GolfPlayer): boolean {
  return player.table.some(slot => !slot.faceUp);
}

export function isSetupPhase(state: GolfState): boolean {
  return state.players.some(player => player.setupFlipsRemaining > 0);
}

export function canDrawFromStock(state: GolfState, playerId: string): boolean {
  if (state.phase !== 'playing') return false;
  if (isSetupPhase(state)) return false;
  if (state.pendingDraw) return false;
  if (state.pendingOptionalFlip) return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  return state.stock.length > 0 || state.discard.length > 1;
}

export function canTakeDiscard(state: GolfState, playerId: string): boolean {
  if (state.phase !== 'playing') return false;
  if (isSetupPhase(state)) return false;
  if (state.pendingDraw) return false;
  if (state.pendingOptionalFlip) return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  return state.discard.length > 0;
}

export function canSwapWithSlot(state: GolfState, playerId: string, slotIndex: number): boolean {
  if (state.phase !== 'playing') return false;
  if (isSetupPhase(state)) return false;
  if (!state.pendingDraw) return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  if (slotIndex < 0 || slotIndex >= TABLE_SLOT_COUNT) return false;
  return true;
}

export function canDiscardDrawn(state: GolfState, playerId: string): boolean {
  if (state.phase !== 'playing') return false;
  if (isSetupPhase(state)) return false;
  if (!state.pendingDraw) return false;
  if (state.pendingDrawSource !== 'stock') return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  return true;
}

export function canFlipTableSlot(state: GolfState, playerId: string, slotIndex: number): boolean {
  if (state.phase !== 'playing') return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  if (slotIndex < 0 || slotIndex >= TABLE_SLOT_COUNT) return false;
  const current = state.players[state.currentPlayerIndex];
  const slot = current?.table[slotIndex];
  if (!slot || slot.faceUp) return false;

  if (isSetupPhase(state)) {
    return (current?.setupFlipsRemaining ?? 0) > 0;
  }

  return state.pendingOptionalFlip;
}

export function canSkipOptionalFlip(state: GolfState, playerId: string): boolean {
  if (state.phase !== 'playing') return false;
  if (!state.pendingOptionalFlip) return false;
  return isCurrentPlayer(state, playerId);
}

export function estimatedSlotValue(table: TableSlot[], slotIndex: number): number {
  const slot = table[slotIndex];
  if (!slot) return 0;
  if (slot.faceUp) return slotPointValue(table, slotIndex);
  return 7;
}
