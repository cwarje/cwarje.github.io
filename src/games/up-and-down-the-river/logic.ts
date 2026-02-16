import type { Player } from '../../networking/types';
import type { Card, Rank, Suit, UpRiverAction, UpRiverPlayer, UpRiverState } from './types';
import { cardEquals, getTrickWinnerPlayerId, isValidUpRiverPlay } from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const ROUND_SEQUENCE: number[] = [1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1];

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

function startRound(players: UpRiverPlayer[], roundIndex: number, dealerIndex: number): UpRiverState {
  const cardCount = ROUND_SEQUENCE[roundIndex];
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

  const trumpCard = deck[playerCount * cardCount] ?? null;
  const trumpSuit = trumpCard?.suit ?? null;

  return {
    players: dealtPlayers,
    phase: 'bidding',
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

export function createUpRiverState(players: Player[]): UpRiverState {
  const gamePlayers = players.slice(0, 4);
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
  return startRound(initialPlayers, 0, 0);
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
  const isLastRound = state.roundIndex >= ROUND_SEQUENCE.length - 1;

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

  const nextDealer = (state.dealerIndex + 1) % scoredPlayers.length;
  return startRound(scoredPlayers, state.roundIndex + 1, nextDealer);
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
  }

  return state;
}

export function isUpRiverOver(state: unknown): boolean {
  return (state as UpRiverState).gameOver;
}

function chooseBid(hand: Card[], trumpSuit: Suit | null, maxBid: number): number {
  let estimate = 0;
  for (const card of hand) {
    if (trumpSuit !== null && card.suit === trumpSuit && card.rank >= 10) estimate += 0.6;
    else if (card.rank >= 13) estimate += 0.45;
    else if (card.rank >= 11) estimate += 0.25;
  }
  return Math.max(0, Math.min(maxBid, Math.round(estimate)));
}

function choosePlayCard(state: UpRiverState, playerIndex: number): Card | null {
  const player = state.players[playerIndex];
  if (!player) return null;

  const validCards = player.hand.filter(card => isValidUpRiverPlay(state, playerIndex, card));
  if (validCards.length === 0) return null;

  const byRankAsc = [...validCards].sort((a, b) => a.rank - b.rank);
  const byRankDesc = [...validCards].sort((a, b) => b.rank - a.rank);

  if (state.currentTrick.length === 0) {
    const nonTrump = byRankDesc.filter(card => card.suit !== state.trumpSuit);
    return nonTrump[0] ?? byRankDesc[0];
  }

  const leadSuit = state.currentTrick[0].card.suit;
  const followSuit = byRankAsc.filter(card => card.suit === leadSuit);
  if (followSuit.length > 0) return followSuit[0];

  const nonTrump = byRankAsc.filter(card => card.suit !== state.trumpSuit);
  if (nonTrump.length > 0) return nonTrump[0];

  return byRankAsc[0];
}

export function runUpRiverBotTurn(state: unknown): unknown {
  const s = state as UpRiverState;
  if (s.gameOver) return state;

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer?.isBot) return state;

  if (s.phase === 'bidding') {
    if (currentPlayer.bid !== null) return state;
    const bid = chooseBid(currentPlayer.hand, s.trumpSuit, s.currentRoundCardCount);
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
