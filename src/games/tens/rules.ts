import type { Card, FrontPile, Rank, TensPlayer, TensState } from './types';
import { PILES_PER_PLAYER } from './types';

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

/** Ace is low (1), King is high (13) for play comparison. */
export function playRankValue(rank: Rank): number {
  if (rank === 14) return 1;
  return rank;
}

export function deckCountForPlayers(playerCount: number): number {
  if (playerCount <= 5) return 2;
  if (playerCount <= 7) return 3;
  return 4;
}

export function cardPenaltyPoints(card: Card): number {
  if (card.rank === 10) return 25;
  if (card.rank === 11) return 11;
  if (card.rank === 12) return 12;
  if (card.rank === 13) return 13;
  if (card.rank === 14) return 1;
  return card.rank;
}

export function allPileTopsPlayed(player: TensPlayer): boolean {
  return player.tablePiles.every(pile => !pile.topCard);
}

export function getPilePlayableCard(
  pile: FrontPile,
  options?: { allTopsPlayed?: boolean },
): { card: Card; fromTop: boolean } | null {
  if (pile.topCard) return { card: pile.topCard, fromTop: true };
  if (options?.allTopsPlayed && pile.bottomCard) {
    return { card: pile.bottomCard, fromTop: false };
  }
  return null;
}

export interface PlayableCard {
  card: Card;
  source: 'hand' | 'pile-top' | 'pile-bottom';
  pileIndex?: number;
}

export function listPlayableCards(player: TensPlayer): PlayableCard[] {
  const fromHand: PlayableCard[] = player.hand.map(card => ({
    card,
    source: 'hand',
  }));

  const allTopsPlayed = allPileTopsPlayed(player);
  const fromPiles: PlayableCard[] = player.tablePiles.flatMap((pile, pileIndex) => {
    const playable = getPilePlayableCard(pile, { allTopsPlayed });
    if (!playable) return [];
    return [{
      card: playable.card,
      source: playable.fromTop ? 'pile-top' as const : 'pile-bottom' as const,
      pileIndex,
    }];
  });

  return [...fromHand, ...fromPiles];
}

export function countCardsHeld(player: TensPlayer): number {
  let count = player.hand.length;
  for (const pile of player.tablePiles) {
    if (pile.bottomCard) count += 1;
    if (pile.topCard) count += 1;
  }
  return count;
}

export function allCardsHeld(player: TensPlayer): Card[] {
  const cards = [...player.hand];
  for (const pile of player.tablePiles) {
    if (pile.bottomCard) cards.push(pile.bottomCard);
    if (pile.topCard) cards.push(pile.topCard);
  }
  return cards;
}

export function isSetClear(centerPile: Card[]): boolean {
  const byRank = new Map<Rank, number>();
  for (const card of centerPile) {
    byRank.set(card.rank, (byRank.get(card.rank) ?? 0) + 1);
  }
  for (const count of byRank.values()) {
    if (count >= 4) return true;
  }
  return false;
}

export function canPlayRank(rank: Rank, lastPlayRank: Rank | null): boolean {
  if (lastPlayRank === null) return true;
  return playRankValue(rank) <= playRankValue(lastPlayRank);
}

export function wouldPickup(rank: Rank, lastPlayRank: Rank | null): boolean {
  if (lastPlayRank === null) return false;
  return playRankValue(rank) > playRankValue(lastPlayRank);
}

function matchesPlay(entry: PlayableCard, play: { card: Card; source: PlaySource; pileIndex?: number }): boolean {
  if (!cardEquals(entry.card, play.card)) return false;
  if (entry.source !== play.source) return false;
  if (play.source === 'hand') return true;
  return entry.pileIndex === play.pileIndex;
}

type PlaySource = 'hand' | 'pile-top' | 'pile-bottom';

export function validatePlays(
  state: TensState,
  playerIndex: number,
  plays: { card: Card; source: PlaySource; pileIndex?: number }[],
): boolean {
  if (plays.length === 0) return false;
  const player = state.players[playerIndex];
  if (!player) return false;

  const available = listPlayableCards(player);
  let remaining = [...available];
  for (const play of plays) {
    const idx = remaining.findIndex(entry => matchesPlay(entry, play));
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }

  const ranks = new Set(plays.map(p => p.card.rank));
  if (ranks.size !== 1) return false;

  const rank = plays[0].card.rank;

  if (rank === 10) {
    return true;
  }

  return canPlayRank(rank, state.lastPlayRank) || wouldPickup(rank, state.lastPlayRank);
}

export function listLegalPlayGroups(
  state: TensState,
  playerIndex: number,
): { rank: Rank; plays: PlayableCard[] }[] {
  const player = state.players[playerIndex];
  if (!player || state.phase !== 'playing') return [];

  const available = listPlayableCards(player);
  const byRank = new Map<Rank, PlayableCard[]>();
  for (const entry of available) {
    const group = byRank.get(entry.card.rank) ?? [];
    group.push(entry);
    byRank.set(entry.card.rank, group);
  }

  const groups: { rank: Rank; plays: PlayableCard[] }[] = [];
  for (const [rank, entries] of byRank) {
    if (canPlayRank(rank, state.lastPlayRank) || wouldPickup(rank, state.lastPlayRank)) {
      groups.push({ rank, plays: entries });
    }
  }

  if (available.some(e => e.card.rank === 10)) {
    groups.push({
      rank: 10,
      plays: available.filter(e => e.card.rank === 10),
    });
  }

  return groups;
}

export function playerHasNoCards(player: TensPlayer): boolean {
  return countCardsHeld(player) === 0;
}

export function ensurePileCount(piles: FrontPile[]): FrontPile[] {
  const result = [...piles];
  while (result.length < PILES_PER_PLAYER) {
    result.push({ bottomCard: null, topCard: null, bottomFaceUp: false });
  }
  return result.slice(0, PILES_PER_PLAYER);
}
