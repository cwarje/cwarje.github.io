import type { Card, FrontPile, Suit, TwelvePlayer, TwelveState } from './types';

export interface PlayableCard {
  card: Card;
  source: 'hand' | 'pile';
  handIndex?: number;
  pileIndex?: number;
  fromTop?: boolean;
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

export function cardPointValue(card: Card): number {
  if (card.rank >= 6 && card.rank <= 9) return 0;
  if (card.rank === 10) return 10;
  if (card.rank === 11) return 2;
  if (card.rank === 12) return 3;
  if (card.rank === 13) return 4;
  return 11; // A
}

export function getPilePlayableCard(pile: FrontPile): { card: Card; fromTop: boolean } | null {
  if (pile.topCard) return { card: pile.topCard, fromTop: true };
  if (pile.bottomCard && pile.bottomFaceUp) return { card: pile.bottomCard, fromTop: false };
  return null;
}

export function listPlayableCards(player: TwelvePlayer): PlayableCard[] {
  const fromHand: PlayableCard[] = player.hand.map((card, i) => ({
    card,
    source: 'hand',
    handIndex: i,
  }));

  const fromPiles: PlayableCard[] = player.frontPiles.flatMap((pile, pileIndex) => {
    const playable = getPilePlayableCard(pile);
    if (!playable) return [];
    return [{
      card: playable.card,
      source: 'pile' as const,
      pileIndex,
      fromTop: playable.fromTop,
    }];
  });

  return [...fromHand, ...fromPiles];
}

export function isLegalPlay(
  state: TwelveState,
  playerIndex: number,
  card: Card,
  source: 'hand' | 'pile',
  pileIndex?: number,
): boolean {
  const player = state.players[playerIndex];
  if (!player) return false;
  const available = listPlayableCards(player);
  const candidate = available.find((entry) => {
    if (!cardEquals(entry.card, card)) return false;
    if (entry.source !== source) return false;
    if (source === 'pile') return entry.pileIndex === pileIndex;
    return true;
  });
  if (!candidate) return false;

  if (state.currentTrick.length === 0) return true;
  const leadSuit = state.currentTrick[0].card.suit;
  const hasLeadSuit = available.some(entry => entry.card.suit === leadSuit);
  if (hasLeadSuit && card.suit !== leadSuit) return false;
  return true;
}

export function getTrickWinnerPlayerId(
  trick: { playerId: string; card: Card }[],
  trumpSuit: Suit | null,
): string | null {
  if (trick.length === 0) return null;
  const leadSuit = trick[0].card.suit;
  let winner = trick[0];

  for (const entry of trick.slice(1)) {
    const challenger = entry.card;
    const current = winner.card;
    const challengerTrump = trumpSuit !== null && challenger.suit === trumpSuit;
    const currentTrump = trumpSuit !== null && current.suit === trumpSuit;

    if (challengerTrump && !currentTrump) {
      winner = entry;
      continue;
    }
    if (!challengerTrump && currentTrump) continue;

    if (challengerTrump && currentTrump) {
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

export function suitsWithRoyalPair(player: TwelvePlayer): Suit[] {
  const all = listPlayableCards(player).map(entry => entry.card);
  const suits: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
  return suits.filter((suit) => {
    const hasQ = all.some(card => card.suit === suit && card.rank === 12);
    const hasK = all.some(card => card.suit === suit && card.rank === 13);
    return hasQ && hasK;
  });
}
