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

function wouldWinTrick(card: Card, trick: { playerId: string; card: Card }[]): boolean {
  if (trick.length === 0) return true;
  const simulated = [...trick, { playerId: '__sim__', card }];
  return getTrickWinnerPlayerId(simulated) === '__sim__';
}

function wouldWinTrickAsPlayer(
  card: Card,
  trick: { playerId: string; card: Card }[],
  playerId: string,
): boolean {
  const simulated = [...trick, { playerId, card }];
  return getTrickWinnerPlayerId(simulated) === playerId;
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

function simulateOpponentCard(
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  trickNumber: number,
): Card | null {
  const legal = listLegalPlays(hand, trick);
  if (legal.length === 0) return null;

  const sorted = sortCardsByRank(legal);
  const avoidWinning = trickNumber >= CARDS_PER_HAND - 1;

  if (avoidWinning) {
    const nonWinners = sorted.filter(c => !wouldWinTrick(c, trick));
    if (nonWinners.length > 0) return nonWinners[0];
    return sorted[0];
  }

  const beating = lowestBeatingCards(sorted, trick);
  const hasNonBeating = sorted.some(
    c => !beating.some(b => cardEquals(b, c)),
  );

  if (beating.length > 0 && hasNonBeating) {
    return beating[0];
  }

  return sorted[0];
}

interface TrickSimResult {
  winnerId: string;
  winningCard: Card;
}

function simulateTrickOutcome(
  trick: { playerId: string; card: Card }[],
  remainingPlayerIds: string[],
  players: CucumberPlayer[],
  trickNumber: number,
): TrickSimResult | null {
  let currentTrick = [...trick];
  const simHands = new Map(players.map(p => [p.id, [...p.hand]]));

  for (const oppId of remainingPlayerIds) {
    const hand = simHands.get(oppId);
    if (!hand || hand.length === 0) return null;

    const oppCard = simulateOpponentCard(hand, currentTrick, trickNumber);
    if (!oppCard) return null;

    currentTrick = [...currentTrick, { playerId: oppId, card: oppCard }];
    simHands.set(oppId, hand.filter(c => !cardEquals(c, oppCard)));
  }

  const winnerId = getTrickWinnerPlayerId(currentTrick);
  if (!winnerId) return null;

  const entry = currentTrick.find(e => e.playerId === winnerId);
  if (!entry) return null;

  return { winnerId, winningCard: entry.card };
}

function expectedPenaltyIfPlay(
  card: Card,
  state: CucumberState,
  playerId: string,
): number {
  const remaining = getRemainingPlayerIds(state);

  if (remaining.length === 0) {
    return wouldWinTrickAsPlayer(card, state.currentTrick, playerId)
      ? rankValue(card.rank)
      : 0;
  }

  const trickAfterPlay = [...state.currentTrick, { playerId, card }];
  const result = simulateTrickOutcome(
    trickAfterPlay,
    remaining,
    state.players,
    state.trickNumber,
  );

  if (!result) return rankValue(card.rank);

  return result.winnerId === playerId
    ? rankValue(result.winningCard.rank)
    : 0;
}

function botWouldWinTrick(
  card: Card,
  state: CucumberState,
  playerId: string,
): boolean {
  const remaining = getRemainingPlayerIds(state);

  if (remaining.length === 0) {
    return wouldWinTrickAsPlayer(card, state.currentTrick, playerId);
  }

  const trickAfterPlay = [...state.currentTrick, { playerId, card }];
  const result = simulateTrickOutcome(
    trickAfterPlay,
    remaining,
    state.players,
    state.trickNumber,
  );

  return result?.winnerId === playerId;
}

function chooseTrick7Card(
  state: CucumberState,
  playerId: string,
  legal: Card[],
): Card {
  const sorted = sortCardsByRank(legal);
  let best = sorted[0];
  let bestPenalty = Infinity;

  for (const candidate of sorted) {
    const penalty = expectedPenaltyIfPlay(candidate, state, playerId);
    if (penalty < bestPenalty || (penalty === bestPenalty && candidate.rank < best.rank)) {
      bestPenalty = penalty;
      best = candidate;
    }
  }

  return best;
}

function chooseTrick6Card(
  state: CucumberState,
  playerId: string,
  legal: Card[],
  nearElimination: boolean,
): Card {
  if (nearElimination) {
    return chooseTrick7Card(state, playerId, legal);
  }

  const sorted = sortCardsByRank(legal);
  const nonWinning = sorted.filter(card => !botWouldWinTrick(card, state, playerId));

  if (nonWinning.length > 0) {
    return nonWinning[nonWinning.length - 1];
  }

  return sorted[0];
}

function chooseLeadCard(hand: Card[], legal: Card[]): Card {
  const sortedLegal = sortCardsByRank(legal);
  const lowestRankInHand = sortCardsByRank(hand)[0].rank;

  if (hand.length > 1) {
    const withoutReservedLow = sortedLegal.filter(c => c.rank > lowestRankInHand);
    if (withoutReservedLow.length > 0) {
      return withoutReservedLow[withoutReservedLow.length - 1];
    }
  }

  return sortedLegal[sortedLegal.length - 1];
}

function chooseFollowCard(
  hand: Card[],
  trick: { playerId: string; card: Card }[],
  legal: Card[],
): Card {
  const sorted = sortCardsByRank(legal);
  const beating = lowestBeatingCards(hand, trick).filter(b =>
    legal.some(l => cardEquals(l, b)),
  );
  const hasNonBeating = sorted.some(
    c => !beating.some(b => cardEquals(b, c)),
  );

  if (beating.length > 0 && hasNonBeating) {
    return beating[0];
  }

  if (beating.length > 0) {
    return beating[0];
  }

  return sorted[0];
}

export function chooseCucumberPlayCard(state: CucumberState, playerId: string): Card | null {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.hand.length === 0) return null;

  const legal = listLegalPlays(player.hand, state.currentTrick);
  if (legal.length === 0) return null;

  const nearElimination = player.penaltyScore >= state.eliminationThreshold - 12;

  if (state.trickNumber >= CARDS_PER_HAND) {
    return chooseTrick7Card(state, playerId, legal);
  }

  if (state.trickNumber === CARDS_PER_HAND - 1) {
    return chooseTrick6Card(state, playerId, legal, nearElimination);
  }

  if (state.currentTrick.length === 0) {
    return chooseLeadCard(player.hand, legal);
  }

  return chooseFollowCard(player.hand, state.currentTrick, legal);
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
