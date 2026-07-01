import type { GameStartOptions, Player } from '../../networking/types';
import type { Card, CucumberAction, CucumberPlayer, CucumberState, Rank, Suit } from './types';
import { CARDS_PER_HAND, ELIMINATION_THRESHOLD } from './types';
import {
  cardEquals,
  getTrickWinnerPlayerId,
  highestRankInTrick,
  isValidCucumberPlay,
  listLegalPlays,
  rankValue,
} from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const SUIT_SORT_ORDER: Record<Suit, number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand: Card[]): Card[] {
  return sortCardsByRank(hand);
}

function buildHandPlayerIds(players: CucumberPlayer[], dealerIndex: number): string[] {
  const total = players.length;
  const ids: string[] = [];
  for (let step = 1; step <= total; step++) {
    const index = (dealerIndex + step) % total;
    ids.push(players[index].id);
  }
  return ids;
}

function hasReachedLossThreshold(players: CucumberPlayer[], threshold: 30 | 50): boolean {
  return players.some(p => p.penaltyScore >= threshold);
}

function getLowestScoreWinners(players: CucumberPlayer[]): string[] {
  const min = Math.min(...players.map(p => p.penaltyScore));
  return players.filter(p => p.penaltyScore === min).map(p => p.id);
}

function startHand(
  players: CucumberPlayer[],
  handNumber: number,
  dealerIndex: number,
  eliminationThreshold: 30 | 50,
): CucumberState {
  const deck = shuffle(createDeck());
  const handPlayerIds = buildHandPlayerIds(players, dealerIndex);

  let cardOffset = 0;
  const dealtPlayers = players.map((player) => {
    const hand = deck.slice(cardOffset, cardOffset + CARDS_PER_HAND);
    cardOffset += CARDS_PER_HAND;
    return { ...player, hand: sortHand(hand) };
  });

  return {
    players: dealtPlayers,
    phase: 'playing',
    handNumber,
    dealerIndex,
    handPlayerIds,
    currentPlayerIndex: 0,
    currentTrick: [],
    trickNumber: 1,
    trickWinner: null,
    lastHandPenalty: null,
    gameOver: false,
    winners: [],
    eliminationThreshold,
  };
}

function finishGame(players: CucumberPlayer[], eliminationThreshold: 30 | 50): CucumberState {
  return {
    players,
    phase: 'game-over',
    handNumber: 0,
    dealerIndex: 0,
    handPlayerIds: [],
    currentPlayerIndex: 0,
    currentTrick: [],
    trickNumber: CARDS_PER_HAND,
    trickWinner: null,
    lastHandPenalty: null,
    gameOver: true,
    winners: getLowestScoreWinners(players),
    eliminationThreshold,
  };
}

function endHand(state: CucumberState, penaltyPlayerId: string, penaltyPoints: number): CucumberState {
  const updatedPlayers = state.players.map(player =>
    player.id === penaltyPlayerId
      ? { ...player, penaltyScore: player.penaltyScore + penaltyPoints }
      : player,
  );

  const lastHandPenalty = { playerId: penaltyPlayerId, points: penaltyPoints };

  if (hasReachedLossThreshold(updatedPlayers, state.eliminationThreshold)) {
    return {
      ...finishGame(updatedPlayers, state.eliminationThreshold),
      handNumber: state.handNumber,
      dealerIndex: state.dealerIndex,
      lastHandPenalty,
    };
  }

  return {
    ...state,
    players: updatedPlayers,
    phase: 'hand-end',
    currentTrick: [],
    trickWinner: null,
    lastHandPenalty,
  };
}

export function createCucumberState(players: Player[], options?: GameStartOptions): CucumberState {
  const eliminationThreshold: 30 | 50 =
    options?.cucumberEliminationThreshold === 50 ? 50 : ELIMINATION_THRESHOLD;

  const gamePlayers: CucumberPlayer[] = players.slice(0, 6).map(player => ({
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    hand: [],
    penaltyScore: 0,
  }));

  const dealerIndex = 0;
  return startHand(gamePlayers, 1, dealerIndex, eliminationThreshold);
}

export function processCucumberAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as CucumberState;
  const a = action as CucumberAction;
  if (s.gameOver) return state;

  switch (a.type) {
    case 'play-card': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      if (!isValidCucumberPlay(s, playerId, a.card)) return state;

      const playerIndex = s.players.findIndex(p => p.id === playerId);
      const player = s.players[playerIndex];
      const newHand = player.hand.filter(card => !cardEquals(card, a.card));
      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...player, hand: newHand };

      const newTrick = [...s.currentTrick, { playerId, card: a.card }];
      const handSize = s.handPlayerIds.length;

      if (newTrick.length === handSize) {
        const winnerId = getTrickWinnerPlayerId(newTrick);
        return {
          ...s,
          players: newPlayers,
          currentTrick: newTrick,
          trickWinner: winnerId,
        };
      }

      return {
        ...s,
        players: newPlayers,
        currentTrick: newTrick,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % handSize,
      };
    }

    case 'resolve-trick': {
      if (s.phase !== 'playing' || !s.trickWinner) return state;

      const winnerId = s.trickWinner;
      const winnerHandIndex = s.handPlayerIds.indexOf(winnerId);
      if (winnerHandIndex === -1) return state;

      if (s.trickNumber >= CARDS_PER_HAND) {
        const winnerEntry = s.currentTrick.find(entry => entry.playerId === winnerId);
        if (!winnerEntry) return state;
        const penaltyPoints = rankValue(winnerEntry.card.rank);
        return endHand(s, winnerId, penaltyPoints);
      }

      const nextTrickNumber = s.trickNumber + 1;
      return {
        ...s,
        currentTrick: [],
        trickWinner: null,
        trickNumber: nextTrickNumber,
        currentPlayerIndex: winnerHandIndex,
      };
    }

    case 'start-next-hand': {
      if (s.phase !== 'hand-end' || s.gameOver) return state;

      if (hasReachedLossThreshold(s.players, s.eliminationThreshold)) {
        return finishGame(s.players, s.eliminationThreshold);
      }

      const nextDealer = (s.dealerIndex + 1) % s.players.length;
      return startHand(s.players, s.handNumber + 1, nextDealer, s.eliminationThreshold);
    }

    case 'dev-set-near-loss': {
      const pIndex = s.players.findIndex(p => p.id === playerId);
      if (pIndex === -1) return state;
      const nearLoss = s.eliminationThreshold - 1;
      const newPlayers = [...s.players];
      newPlayers[pIndex] = { ...newPlayers[pIndex], penaltyScore: nearLoss };
      return { ...s, players: newPlayers };
    }
  }

  return state;
}

function sortCardsByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return SUIT_SORT_ORDER[a.suit] - SUIT_SORT_ORDER[b.suit];
  });
}

const HIGH_RANK = 10;
const LOW_RANK = 7;
const PREMIUM_RANK = 12;
const MIN_FORCE_TARGETS = 2;

type HandShape = 'top-heavy' | 'bottom-heavy' | 'balanced';

interface HandProfile {
  shape: HandShape;
  highCount: number;
  lowCount: number;
  premiumCount: number;
}

function analyzeHandProfile(hand: Card[]): HandProfile {
  const highCount = hand.filter(c => c.rank >= HIGH_RANK).length;
  const lowCount = hand.filter(c => c.rank <= LOW_RANK).length;
  const premiumCount = hand.filter(c => c.rank >= PREMIUM_RANK).length;

  let shape: HandShape = 'balanced';
  if (highCount >= 4 && lowCount <= 2) shape = 'top-heavy';
  else if (lowCount >= 4 && highCount <= 2) shape = 'bottom-heavy';

  return { shape, highCount, lowCount, premiumCount };
}

function lowestRankInHand(hand: Card[]): number {
  return sortCardsByRank(hand)[0].rank;
}

function lowCardsToReserve(trickNumber: number, handSize: number): number {
  return Math.min(handSize - 1, CARDS_PER_HAND - trickNumber);
}

function getReservedRanks(hand: Card[], trickNumber: number): Set<number> {
  const reserveCount = lowCardsToReserve(trickNumber, hand.length);
  if (reserveCount <= 0) return new Set();
  return new Set(sortCardsByRank(hand).slice(0, reserveCount).map(c => c.rank));
}

function getExpendableCards(hand: Card[], legal: Card[], trickNumber: number): Card[] {
  if (hand.length <= 1) return sortCardsByRank(legal);
  const reservedRanks = getReservedRanks(hand, trickNumber);
  const expendable = sortCardsByRank(legal.filter(c => !reservedRanks.has(c.rank)));
  if (expendable.length > 0) return expendable;
  return sortCardsByRank(legal);
}

function canSloughWithoutAnchor(
  hand: Card[],
  legal: Card[],
  trick: { playerId: string; card: Card }[],
  trickNumber: number,
): boolean {
  if (trick.some(e => e.card.rank === 14)) return false;
  if (hand.length === 1) return true;
  return getExpendableCards(hand, legal, trickNumber).length > 0;
}

function sloughCard(
  hand: Card[],
  legal: Card[],
  trick: { playerId: string; card: Card }[],
  trickNumber: number,
): Card {
  const anchor = lowestRankInHand(hand);
  const reservedRanks = getReservedRanks(hand, trickNumber);
  const sloughable = getExpendableCards(hand, legal, trickNumber);
  const highest = trick.length > 0 ? highestRankInTrick(trick) : 0;

  if (sloughable.length > 0) {
    const nonWinning = sloughable.filter(c => c.rank < highest);
    if (nonWinning.length > 0) return nonWinning[nonWinning.length - 1];

    const winningExpendable = sloughable.filter(c => c.rank >= highest);
    if (winningExpendable.length > 0 && winningExpendable[0].rank < 14) {
      return winningExpendable[0];
    }

    const anchorLegal = sortCardsByRank(legal.filter(c => c.rank === anchor));
    if (anchorLegal.length > 0 && anchor < highest) return anchorLegal[0];
    return sloughable[0];
  }

  const reservedLegal = sortCardsByRank(legal.filter(c => reservedRanks.has(c.rank)));
  const reservedNonWinning = reservedLegal.filter(c => c.rank < highest);
  if (reservedNonWinning.length > 0) return reservedNonWinning[0];
  if (reservedLegal.length > 0) return reservedLegal[0];
  return sortCardsByRank(legal)[0];
}

function countSparePremium(hand: Card[], exclude?: Card): number {
  const low = lowestRankInHand(hand);
  return hand.filter(
    c => c.rank >= PREMIUM_RANK
      && c.rank > low
      && !(exclude && cardEquals(c, exclude)),
  ).length;
}

function legalBeatingCards(
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  legal: Card[],
): Card[] {
  return lowestBeatingCards(hand, trick).filter(b =>
    legal.some(l => cardEquals(l, b)),
  );
}

function highestLegalBeating(
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  legal: Card[],
): Card | null {
  const beating = legalBeatingCards(hand, trick, legal);
  return beating.length > 0 ? beating[beating.length - 1] : null;
}

function aceInLegalBeating(
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  legal: Card[],
): Card | null {
  const beating = legalBeatingCards(hand, trick, legal);
  return beating.find(c => c.rank === 14) ?? null;
}

function shouldSpendAce(
  profile: HandProfile,
  remainingCount: number,
  hand: Card[],
  legal: Card[],
  trick: { playerId: string; card: Card }[],
  trickNumber: number,
): boolean {
  const ace = aceInLegalBeating(hand, trick, legal)
    ?? (trick.length === 0 ? sortCardsByRank(legal).find(c => c.rank === 14) : null);
  if (!ace) return false;

  const beating = legalBeatingCards(hand, trick, legal);
  const canSlough = canSloughWithoutAnchor(hand, legal, trick, trickNumber);
  if (beating.length === 1 && cardEquals(beating[0], ace) && !canSlough) return true;

  if (remainingCount < MIN_FORCE_TARGETS) return false;

  switch (profile.shape) {
    case 'top-heavy':
    case 'balanced':
      return countSparePremium(hand) >= 1;
    case 'bottom-heavy':
      return countSparePremium(hand) >= 2;
  }
}

function pickForceCard(
  profile: HandProfile,
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  legal: Card[],
  remainingCount: number,
  trickNumber: number,
): Card | null {
  if (remainingCount < MIN_FORCE_TARGETS) return null;

  if (shouldSpendAce(profile, remainingCount, hand, legal, trick, trickNumber)) {
    const ace = trick.length === 0
      ? getExpendableCards(hand, legal, trickNumber).find(c => c.rank === 14)
      : aceInLegalBeating(hand, trick, legal);
    if (ace) return ace;
  }

  const highest = trick.length === 0
    ? getExpendableCards(hand, legal, trickNumber).filter(c => c.rank < 14).at(-1) ?? null
    : highestLegalBeating(hand, trick, legal);

  if (!highest || highest.rank === 14) return null;

  switch (profile.shape) {
    case 'top-heavy':
      return highest;
    case 'bottom-heavy':
    case 'balanced':
      return countSparePremium(hand, highest) >= 1 ? highest : null;
  }
}

function chooseConservativeFollow(
  profile: HandProfile,
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  legal: Card[],
  trickNumber: number,
): Card {
  const sorted = sortCardsByRank(legal);
  const beating = legalBeatingCards(hand, trick, legal);
  const canSlough = canSloughWithoutAnchor(hand, legal, trick, trickNumber);

  if (canSlough) {
    if (profile.shape === 'bottom-heavy' || profile.shape === 'balanced') {
      return sloughCard(hand, legal, trick, trickNumber);
    }
    if (profile.shape === 'top-heavy' && beating.length > 0) {
      const anchor = lowestRankInHand(hand);
      if (anchor >= 9) {
        const midHighBeat = beating.find(c => c.rank >= 10 && c.rank <= 11);
        if (midHighBeat && profile.premiumCount >= 2) return midHighBeat;
      }
    }
    return sloughCard(hand, legal, trick, trickNumber);
  }

  if (beating.length > 0) {
    const expendableBeating = getExpendableCards(hand, beating, trickNumber);
    if (expendableBeating.length > 0) return expendableBeating[0];
    return beating[0];
  }
  return sorted[0];
}

function chooseFollowCard(
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  legal: Card[],
  profile: HandProfile,
  remainingCount: number,
  trickNumber: number,
): Card {
  const force = pickForceCard(profile, hand, trick, legal, remainingCount, trickNumber);
  if (force) return force;
  return chooseConservativeFollow(profile, hand, trick, legal, trickNumber);
}

function chooseLeadCard(
  hand: Card[],
  legal: Card[],
  profile: HandProfile,
  remainingCount: number,
  trickNumber: number,
): Card {
  const playable = getExpendableCards(hand, legal, trickNumber);
  const pool = playable.length > 0 ? playable : sortCardsByRank(legal);

  const force = pickForceCard(profile, hand, [], pool, remainingCount, trickNumber);
  if (force) return force;

  return pool.at(-1) ?? pool[0];
}

function getRemainingPlayerIds(state: CucumberState): string[] {
  const handSize = state.handPlayerIds.length;
  const slotsRemaining = handSize - state.currentTrick.length - 1;
  const remaining: string[] = [];
  for (let i = 1; i <= slotsRemaining; i++) {
    const index = (state.currentPlayerIndex + i) % handSize;
    remaining.push(state.handPlayerIds[index]);
  }
  return remaining;
}

function lowestBeatingCards(hand: Card[], trick: { playerId: string; card: Card }[]): Card[] {
  const highest = highestRankInTrick(trick);
  return sortCardsByRank(hand.filter(c => c.rank >= highest));
}

export function chooseCucumberPlayCard(state: CucumberState, playerId: string): Card | null {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.hand.length === 0) return null;

  const legal = listLegalPlays(player.hand, state.currentTrick);
  if (legal.length === 0) return null;

  const sorted = sortCardsByRank(legal);

  if (state.trickNumber >= CARDS_PER_HAND) {
    return sorted[0];
  }

  if (state.trickNumber === CARDS_PER_HAND - 1) {
    return sorted[sorted.length - 1];
  }

  const profile = analyzeHandProfile(player.hand);
  const remainingCount = state.currentTrick.length === 0
    ? state.handPlayerIds.length - 1
    : getRemainingPlayerIds(state).length;

  if (state.currentTrick.length === 0) {
    return chooseLeadCard(player.hand, legal, profile, remainingCount, state.trickNumber);
  }

  return chooseFollowCard(
    player.hand,
    state.currentTrick,
    legal,
    profile,
    remainingCount,
    state.trickNumber,
  );
}

export function runCucumberBotTurn(state: unknown): unknown {
  const s = state as CucumberState;
  if (s.gameOver || s.phase !== 'playing' || s.trickWinner) return state;

  const currentPlayerId = s.handPlayerIds[s.currentPlayerIndex];
  const currentPlayer = s.players.find(p => p.id === currentPlayerId);
  if (!currentPlayer?.isBot) return state;

  const card = chooseCucumberPlayCard(s, currentPlayerId);
  if (!card) return state;

  return processCucumberAction(s, { type: 'play-card', card }, currentPlayerId);
}

export function isCucumberOver(state: unknown): boolean {
  return (state as CucumberState).gameOver;
}

export function getCucumberWinners(state: unknown): string[] {
  return (state as CucumberState).winners;
}
