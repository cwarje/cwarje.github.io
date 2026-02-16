import type { Card, UpRiverState } from './types';

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function isValidUpRiverPlay(state: UpRiverState, playerIndex: number, card: Card): boolean {
  const player = state.players[playerIndex];
  if (!player) return false;
  if (!player.hand.some(c => cardEquals(c, card))) return false;

  if (state.currentTrick.length === 0) {
    return true;
  }

  const leadSuit = state.currentTrick[0].card.suit;
  const hasLeadSuit = player.hand.some(c => c.suit === leadSuit);
  if (hasLeadSuit && card.suit !== leadSuit) return false;
  return true;
}

export function getTrickWinnerPlayerId(
  trick: { playerId: string; card: Card }[],
  trumpSuit: Card['suit'] | null,
): string | null {
  if (trick.length === 0) return null;

  const leadSuit = trick[0].card.suit;
  let winner = trick[0];

  for (const entry of trick.slice(1)) {
    const challenger = entry.card;
    const current = winner.card;
    const challengerIsTrump = trumpSuit !== null && challenger.suit === trumpSuit;
    const currentIsTrump = trumpSuit !== null && current.suit === trumpSuit;

    if (challengerIsTrump && !currentIsTrump) {
      winner = entry;
      continue;
    }
    if (!challengerIsTrump && currentIsTrump) {
      continue;
    }

    if (currentIsTrump && challengerIsTrump) {
      if (challenger.rank > current.rank) winner = entry;
      continue;
    }

    if (challenger.suit === leadSuit && current.suit !== leadSuit) {
      winner = entry;
      continue;
    }

    if (challenger.suit === leadSuit && current.suit === leadSuit && challenger.rank > current.rank) {
      winner = entry;
    }
  }

  return winner.playerId;
}
