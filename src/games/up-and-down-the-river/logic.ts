import type { Player, UpRiverStartMode } from '../../networking/types';
import type { Card, Rank, Suit, UpRiverAction, UpRiverPlayer, UpRiverState } from './types';
import { cardEquals, getTrickWinnerPlayerId, isValidUpRiverPlay } from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const ROUND_SEQUENCE_UP_DOWN: number[] = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
export const ROUND_SEQUENCE_DOWN_UP: number[] = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7];

function getRoundSequence(upRiverStartMode: UpRiverStartMode): number[] {
  return upRiverStartMode === 'down-up' ? ROUND_SEQUENCE_DOWN_UP : ROUND_SEQUENCE_UP_DOWN;
}

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
  const suitOrder: Record<Suit, number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.rank - b.rank;
  });
}

function startRound(
  players: UpRiverPlayer[],
  roundIndex: number,
  dealerIndex: number,
  roundSequence: number[],
  upRiverStartMode: UpRiverStartMode,
): UpRiverState {
  const cardCount = roundSequence[roundIndex];
  const playerCount = players.length;
  const deck = shuffle(createDeck());
  const biddingStartIndex = (dealerIndex + 1) % playerCount;

  const dealtPlayers = players.map((player, i) => {
    const hand = deck.slice(i * cardCount, (i + 1) * cardCount);
    return {
      ...player,
      hand: sortHand(hand),
      bid: null,
      tricksWon: 0,
      roundScore: 0,
    };
  });

  const isLastRound = roundIndex >= roundSequence.length - 1;
  const trumpCard = isLastRound ? null : (deck[playerCount * cardCount] ?? null);
  const trumpSuit = trumpCard?.suit ?? null;

  return {
    players: dealtPlayers,
    phase: 'bidding',
    upRiverStartMode,
    roundSequence,
    roundIndex,
    currentRoundCardCount: cardCount,
    dealerIndex,
    leaderIndex: biddingStartIndex,
    currentPlayerIndex: biddingStartIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 1,
    trumpSuit,
    trumpCard,
    gameOver: false,
    winner: null,
  };
}

export function createUpRiverState(players: Player[], options?: { upRiverStartMode?: UpRiverStartMode }): UpRiverState {
  const gamePlayers = players.slice(0, 6);
  const upRiverStartMode = options?.upRiverStartMode ?? 'up-down';
  const roundSequence = getRoundSequence(upRiverStartMode);
  const initialPlayers: UpRiverPlayer[] = gamePlayers.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    hand: [],
    bid: null,
    tricksWon: 0,
    roundScore: 0,
    totalScore: 0,
  }));
  return startRound(initialPlayers, 0, 0, roundSequence, upRiverStartMode);
}

function applyRoundScoring(players: UpRiverPlayer[]): UpRiverPlayer[] {
  return players.map((player) => {
    const matched = player.bid !== null && player.bid === player.tricksWon;
    const roundScore = matched ? 10 + player.tricksWon : 0;
    return {
      ...player,
      roundScore,
      totalScore: player.totalScore + roundScore,
    };
  });
}

function endRound(state: UpRiverState): UpRiverState {
  const scoredPlayers = applyRoundScoring(state.players);
  const isLastRound = state.roundIndex >= state.roundSequence.length - 1;

  if (isLastRound) {
    const maxScore = Math.max(...scoredPlayers.map(p => p.totalScore));
    const winner = scoredPlayers.find(p => p.totalScore === maxScore)?.id ?? null;
    return {
      ...state,
      players: scoredPlayers,
      phase: 'round-end',
      gameOver: true,
      winner,
      trickWinner: null,
      currentTrick: [],
    };
  }

  return {
    ...state,
    players: scoredPlayers,
    phase: 'round-end',
    gameOver: false,
    winner: null,
    trickWinner: null,
    currentTrick: [],
  };
}

export function processUpRiverAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as UpRiverState;
  const a = action as UpRiverAction;
  if (s.gameOver) return state;

  switch (a.type) {
    case 'place-bid': {
      if (s.phase !== 'bidding') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!Number.isInteger(a.bid) || a.bid < 0 || a.bid > s.currentRoundCardCount) return state;
      if (s.players[playerIndex].bid !== null) return state;

      const updatedPlayers = [...s.players];
      updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], bid: a.bid };
      const allBidsIn = updatedPlayers.every(p => p.bid !== null);

      if (allBidsIn) {
        return {
          ...s,
          players: updatedPlayers,
          phase: 'playing',
          currentPlayerIndex: s.leaderIndex,
        };
      }

      return {
        ...s,
        players: updatedPlayers,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
      };
    }

    case 'play-card': {
      if (s.phase !== 'playing') return state;
      if (s.trickWinner) return state;

      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!isValidUpRiverPlay(s, playerIndex, a.card)) return state;

      const player = s.players[playerIndex];
      const newHand = player.hand.filter(card => !cardEquals(card, a.card));
      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...player, hand: newHand };
      const newTrick = [...s.currentTrick, { playerId, card: a.card }];

      if (newTrick.length === s.players.length) {
        const winnerId = getTrickWinnerPlayerId(newTrick, s.trumpSuit);
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
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
      };
    }

    case 'resolve-trick': {
      if (s.phase !== 'playing' || !s.trickWinner) return state;
      const winnerIndex = s.players.findIndex(p => p.id === s.trickWinner);
      if (winnerIndex === -1) return state;

      const updatedPlayers = [...s.players];
      updatedPlayers[winnerIndex] = {
        ...updatedPlayers[winnerIndex],
        tricksWon: updatedPlayers[winnerIndex].tricksWon + 1,
      };

      const nextTrickNumber = s.trickNumber + 1;
      if (nextTrickNumber > s.currentRoundCardCount) {
        return endRound({
          ...s,
          players: updatedPlayers,
          trickWinner: null,
          currentTrick: [],
        });
      }

      return {
        ...s,
        players: updatedPlayers,
        currentTrick: [],
        trickWinner: null,
        trickNumber: nextTrickNumber,
        leaderIndex: winnerIndex,
        currentPlayerIndex: winnerIndex,
      };
    }

    case 'start-next-round': {
      if (s.phase !== 'round-end' || s.gameOver) return state;
      const nextDealer = (s.dealerIndex + 1) % s.players.length;
      return startRound(
        s.players,
        s.roundIndex + 1,
        nextDealer,
        s.roundSequence,
        s.upRiverStartMode,
      );
    }
  }

  return state;
}

export function getUpRiverWinners(state: unknown): string[] {
  const s = state as UpRiverState;
  const maxScore = Math.max(...s.players.map(p => p.totalScore));
  return s.players.filter(p => p.totalScore === maxScore).map(p => p.id);
}

export function isUpRiverOver(state: unknown): boolean {
  return (state as UpRiverState).gameOver;
}

function getSuitCounts(hand: Card[]): Record<Suit, number> {
  return hand.reduce<Record<Suit, number>>(
    (counts, card) => {
      counts[card.suit] += 1;
      return counts;
    },
    { clubs: 0, diamonds: 0, spades: 0, hearts: 0 },
  );
}

function getNonTrumpControlValue(rank: number, noTrumpRound: boolean): number {
  if (rank === 14) return noTrumpRound ? 0.95 : 0.75;
  if (rank === 13) return noTrumpRound ? 0.72 : 0.5;
  if (rank === 12) return noTrumpRound ? 0.48 : 0.34;
  if (rank === 11) return noTrumpRound ? 0.32 : 0.22;
  if (rank === 10) return noTrumpRound ? 0.2 : 0.1;
  return 0;
}

function getTrumpControlValue(rank: number): number {
  if (rank === 14) return 1.15;
  if (rank === 13) return 0.95;
  if (rank === 12) return 0.8;
  if (rank === 11) return 0.65;
  if (rank === 10) return 0.5;
  if (rank >= 8) return 0.32;
  return 0.2;
}

function estimateBidFromHand(hand: Card[], trumpSuit: Suit | null, roundCardCount: number): number {
  const noTrumpRound = trumpSuit === null;
  const suitCounts = getSuitCounts(hand);
  let estimate = 0;

  for (const card of hand) {
    if (!noTrumpRound && card.suit === trumpSuit) {
      estimate += getTrumpControlValue(card.rank);
    } else {
      estimate += getNonTrumpControlValue(card.rank, noTrumpRound);
    }
  }

  if (!noTrumpRound && trumpSuit !== null) {
    const trumpCount = suitCounts[trumpSuit];
    estimate += trumpCount * (roundCardCount <= 2 ? 0.18 : 0.12);
    if (trumpCount >= 2) estimate += 0.3;
    if (trumpCount >= 3) estimate += 0.45;
    if (trumpCount >= 4) estimate += 0.5;

    for (const suit of SUITS) {
      if (suit === trumpSuit) continue;
      const count = suitCounts[suit];
      if (count === 0) estimate += roundCardCount >= 4 ? 0.28 : 0.12;
      if (count === 1) estimate += roundCardCount >= 4 ? 0.14 : 0.06;
    }
  } else {
    const aces = hand.filter(card => card.rank === 14).length;
    const kings = hand.filter(card => card.rank === 13).length;
    estimate += aces * 0.1 + kings * 0.04;
  }

  if (roundCardCount === 1) {
    const single = hand[0];
    if (!single) return 0;
    if (trumpSuit !== null && single.suit === trumpSuit) return single.rank >= 10 ? 1 : 0;
    return single.rank >= 13 ? 1 : 0;
  }

  const volatility =
    roundCardCount <= 2 ? 0.78 :
      roundCardCount <= 4 ? 0.88 :
        roundCardCount <= 6 ? 0.96 : 1.02;
  const adjusted = estimate * volatility;
  return Math.round(adjusted);
}

function cardStrengthIndex(card: Card, leadSuit: Suit | null, trumpSuit: Suit | null): number {
  const isTrump = trumpSuit !== null && card.suit === trumpSuit;
  const isLead = leadSuit !== null && card.suit === leadSuit;
  const suitTier = isTrump ? 3 : isLead ? 2 : 1;
  return suitTier * 100 + card.rank;
}

function compareCardsForCurrentTrick(
  challenger: Card,
  current: Card,
  leadSuit: Suit,
  trumpSuit: Suit | null,
): number {
  const challengerStrength = cardStrengthIndex(challenger, leadSuit, trumpSuit);
  const currentStrength = cardStrengthIndex(current, leadSuit, trumpSuit);
  return challengerStrength - currentStrength;
}

function getCurrentWinningEntry(state: UpRiverState): { playerId: string; card: Card } | null {
  if (state.currentTrick.length === 0) return null;
  const leadSuit = state.currentTrick[0].card.suit;
  let winner = state.currentTrick[0];

  for (const entry of state.currentTrick.slice(1)) {
    if (compareCardsForCurrentTrick(entry.card, winner.card, leadSuit, state.trumpSuit) > 0) {
      winner = entry;
    }
  }
  return winner;
}

function wouldCardWinCurrentTrick(state: UpRiverState, card: Card): boolean {
  const winner = getCurrentWinningEntry(state);
  if (!winner) return true;
  const leadSuit = state.currentTrick[0]?.card.suit;
  if (!leadSuit) return true;
  return compareCardsForCurrentTrick(card, winner.card, leadSuit, state.trumpSuit) > 0;
}

function chooseCheapestWinningCard(state: UpRiverState, candidates: Card[]): Card | null {
  const winning = candidates.filter(card => wouldCardWinCurrentTrick(state, card));
  if (winning.length === 0) return null;
  return winning.sort((a, b) => cardStrengthIndex(a, state.currentTrick[0]?.card.suit ?? null, state.trumpSuit)
    - cardStrengthIndex(b, state.currentTrick[0]?.card.suit ?? null, state.trumpSuit))[0] ?? null;
}

function chooseSafestDiscard(state: UpRiverState, cards: Card[]): Card {
  const byRisk = [...cards].sort((a, b) => {
    const aTrump = state.trumpSuit !== null && a.suit === state.trumpSuit;
    const bTrump = state.trumpSuit !== null && b.suit === state.trumpSuit;
    if (aTrump !== bTrump) return aTrump ? 1 : -1;
    return a.rank - b.rank;
  });
  return byRisk[0];
}

function chooseLeadCard(state: UpRiverState, validCards: Card[], needMoreTricks: boolean): Card {
  const nonTrumpCards = validCards.filter(card => card.suit !== state.trumpSuit);
  const trumpCards = validCards.filter(card => state.trumpSuit !== null && card.suit === state.trumpSuit);

  if (needMoreTricks) {
    const likelyWinners = validCards.filter(card => {
      if (state.trumpSuit !== null && card.suit === state.trumpSuit) return card.rank >= 10;
      return card.rank >= 13;
    });
    if (likelyWinners.length > 0) {
      return [...likelyWinners].sort((a, b) => b.rank - a.rank)[0];
    }
    if (trumpCards.length > 0) return [...trumpCards].sort((a, b) => b.rank - a.rank)[0];
    return [...validCards].sort((a, b) => b.rank - a.rank)[0];
  }

  if (nonTrumpCards.length > 0) {
    return chooseSafestDiscard(state, nonTrumpCards);
  }
  return chooseSafestDiscard(state, validCards);
}

function chooseBid(state: UpRiverState, playerIndex: number): number {
  const player = state.players[playerIndex];
  if (!player) return 0;
  const rawEstimate = estimateBidFromHand(player.hand, state.trumpSuit, state.currentRoundCardCount);
  return Math.max(0, Math.min(state.currentRoundCardCount, rawEstimate));
}

function choosePlayCard(state: UpRiverState, playerIndex: number): Card | null {
  const player = state.players[playerIndex];
  if (!player) return null;

  const validCards = player.hand.filter(card => isValidUpRiverPlay(state, playerIndex, card));
  if (validCards.length === 0) return null;

  const bid = player.bid ?? 0;
  const neededTricks = Math.max(0, bid - player.tricksWon);
  const overTricks = Math.max(0, player.tricksWon - bid);
  const remainingTricks = player.hand.length;
  const needMoreTricks = neededTricks > 0;

  if (state.currentTrick.length === 0) {
    return chooseLeadCard(state, validCards, needMoreTricks);
  }

  const leadSuit = state.currentTrick[0].card.suit;
  const followSuitCards = validCards.filter(card => card.suit === leadSuit);
  const voidCards = validCards.filter(card => card.suit !== leadSuit);

  if (needMoreTricks) {
    const mustPushNow = neededTricks >= remainingTricks;
    const winCard = chooseCheapestWinningCard(state, validCards);
    if (winCard && (mustPushNow || neededTricks > 0)) return winCard;

    if (followSuitCards.length > 0) {
      return [...followSuitCards].sort((a, b) => b.rank - a.rank)[0];
    }

    const trumpCards = voidCards.filter(card => state.trumpSuit !== null && card.suit === state.trumpSuit);
    if (trumpCards.length > 0) {
      return [...trumpCards].sort((a, b) => a.rank - b.rank)[0];
    }

    return chooseSafestDiscard(state, validCards);
  }

  const losingFollowCards = followSuitCards.filter(card => !wouldCardWinCurrentTrick(state, card));
  if (losingFollowCards.length > 0) {
    return [...losingFollowCards].sort((a, b) => b.rank - a.rank)[0];
  }

  if (followSuitCards.length > 0) {
    return [...followSuitCards].sort((a, b) => a.rank - b.rank)[0];
  }

  const nonTrumpVoidCards = voidCards.filter(card => card.suit !== state.trumpSuit);
  if (nonTrumpVoidCards.length > 0) return chooseSafestDiscard(state, nonTrumpVoidCards);

  if (overTricks > 0) {
    return [...validCards].sort((a, b) => a.rank - b.rank)[0];
  }

  return chooseSafestDiscard(state, validCards);
}

export function runUpRiverBotTurn(state: unknown): unknown {
  const s = state as UpRiverState;
  if (s.gameOver) return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer?.isBot) return state;

  if (s.phase === 'bidding') {
    if (currentPlayer.bid !== null) return state;
    const bid = chooseBid(s, s.currentPlayerIndex);
    return processUpRiverAction(s, { type: 'place-bid', bid }, currentPlayer.id);
  }

  if (s.phase === 'playing') {
    if (s.trickWinner) return state;
    const chosen = choosePlayCard(s, s.currentPlayerIndex);
    if (!chosen) return state;
    return processUpRiverAction(s, { type: 'play-card', card: chosen }, currentPlayer.id);
  }

  return state;
}
