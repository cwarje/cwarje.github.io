import type { Card, CucumberState } from './types';

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function rankValue(rank: Card['rank']): number {
  return rank;
}

function dedupeCards(cards: Card[]): Card[] {
  const result: Card[] = [];
  for (const card of cards) {
    if (!result.some(existing => cardEquals(existing, card))) {
      result.push(card);
    }
  }
  return result;
}

export function highestRankInTrick(trick: { playerId: string; card: Card }[]): number {
  if (trick.length === 0) return 0;
  return Math.max(...trick.map(entry => entry.card.rank));
}

export function lowestRankInHand(hand: Card[]): number {
  if (hand.length === 0) return 0;
  return Math.min(...hand.map(card => card.rank));
}

export function cardsAtLowestRank(hand: Card[]): Card[] {
  const lowest = lowestRankInHand(hand);
  return hand.filter(card => card.rank === lowest);
}

export function listLegalPlays(hand: Card[], trick: { playerId: string; card: Card }[]): Card[] {
  if (hand.length === 0) return [];
  if (trick.length === 0) return [...hand];

  if (trick.some(entry => entry.card.rank === 14)) {
    return cardsAtLowestRank(hand);
  }

  const highest = highestRankInTrick(trick);
  const beating = hand.filter(card => card.rank >= highest);
  const lowest = cardsAtLowestRank(hand);

  return dedupeCards([...beating, ...lowest]);
}

export function isValidCucumberPlay(state: CucumberState, playerId: string, card: Card): boolean {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return false;
  if (!player.hand.some(c => cardEquals(c, card))) return false;
  if (state.phase !== 'playing' || state.trickWinner !== null) return false;
  if (state.handPlayerIds[state.currentPlayerIndex] !== playerId) return false;

  return listLegalPlays(player.hand, state.currentTrick).some(c => cardEquals(c, card));
}

/** Rank-only trick winner; ties go to the last played highest card. */
export function getTrickWinnerPlayerId(trick: { playerId: string; card: Card }[]): string | null {
  if (trick.length === 0) return null;

  let winner = trick[0];
  let highest = winner.card.rank;

  for (const entry of trick.slice(1)) {
    if (entry.card.rank >= highest) {
      highest = entry.card.rank;
      winner = entry;
    }
  }

  return winner.playerId;
}
