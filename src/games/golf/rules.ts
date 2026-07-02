import type { Card, GolfPlayer, GolfState, Rank, TableSlot } from './types';
import { TABLE_SLOT_COUNT } from './types';

export const COLUMN_PAIRS: [number, number][] = [
  [0, 3],
  [1, 4],
  [2, 5],
];

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

export function scorePlayerTable(player: GolfPlayer): number {
  let total = 0;
  for (let i = 0; i < TABLE_SLOT_COUNT; i++) {
    total += slotPointValue(player.table, i);
  }
  return total;
}

export function allTableFaceUp(player: GolfPlayer): boolean {
  return player.table.length === TABLE_SLOT_COUNT && player.table.every(slot => slot.faceUp);
}

export function isCurrentPlayer(state: GolfState, playerId: string): boolean {
  const current = state.players[state.currentPlayerIndex];
  return current?.id === playerId;
}

export function canDrawFromStock(state: GolfState, playerId: string): boolean {
  if (state.phase !== 'playing') return false;
  if (state.pendingDraw) return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  return state.stock.length > 0 || state.discard.length > 1;
}

export function canTakeDiscard(state: GolfState, playerId: string): boolean {
  if (state.phase !== 'playing') return false;
  if (state.pendingDraw) return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  return state.discard.length > 0;
}

export function canSwapWithSlot(state: GolfState, playerId: string, slotIndex: number): boolean {
  if (state.phase !== 'playing') return false;
  if (!state.pendingDraw) return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  if (slotIndex < 0 || slotIndex >= TABLE_SLOT_COUNT) return false;
  return true;
}

export function canDiscardDrawn(state: GolfState, playerId: string): boolean {
  if (state.phase !== 'playing') return false;
  if (!state.pendingDraw) return false;
  if (state.pendingDrawSource !== 'stock') return false;
  if (!isCurrentPlayer(state, playerId)) return false;
  return true;
}

export function estimatedSlotValue(table: TableSlot[], slotIndex: number): number {
  const slot = table[slotIndex];
  if (!slot) return 0;
  if (slot.faceUp) return slotPointValue(table, slotIndex);
  return 7;
}
