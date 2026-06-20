import type { HeartsState, Card } from './types';

function cardPoints(card: Card): number {
  if (card.suit === 'hearts') return 1;
  if (card.suit === 'spades' && card.rank === 12) return 13;
  return 0;
}

export function isValidHeartsPlay(state: HeartsState, playerIndex: number, card: Card): boolean {
  const player = state.players[playerIndex];
  if (!player) return false;
  const hand = player.hand;

  // First trick first lead must be the starting club (2 of clubs for 4 players, 3 of clubs for 5).
  if (state.trickNumber === 1 && state.currentTrick.length === 0) {
    const startRank = state.players.length === 5 ? 3 : 2;
    return card.suit === 'clubs' && card.rank === startRank;
  }

  // Must follow lead suit if possible.
  if (state.currentTrick.length > 0) {
    const leadSuit = state.currentTrick[0].card.suit;
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);
    if (hasLeadSuit && card.suit !== leadSuit) return false;
  }

  // Cannot lead hearts before broken unless hand is all hearts.
  if (state.currentTrick.length === 0 && card.suit === 'hearts' && !state.heartsBroken) {
    const hasNonHearts = hand.some(c => c.suit !== 'hearts');
    if (hasNonHearts) return false;
  }

  // On first trick, cannot dump points if void in lead suit unless all remaining cards are points.
  if (state.trickNumber === 1 && state.currentTrick.length > 0) {
    const leadSuit = state.currentTrick[0].card.suit;
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);
    if (!hasLeadSuit && cardPoints(card) > 0) {
      const hasNonPointCards = hand.some(c => cardPoints(c) === 0);
      if (hasNonPointCards) return false;
    }
  }

  return true;
}
