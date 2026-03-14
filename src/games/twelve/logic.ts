import type { Player, TwelvePileCount } from '../../networking/types';
import type { Card, FrontPile, Rank, Suit, TwelveAction, TwelvePlayer, TwelveState } from './types';
import { cardEquals, cardPointValue, getPilePlayableCard, getTrickWinnerPlayerId, isLegalPlay, listPlayableCards, suitsWithRoyalPair } from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [6, 7, 8, 9, 10, 11, 12, 13, 14];
const ALL_PILE_COUNTS: TwelvePileCount[] = [3, 4, 5, 6];

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

function allCardsPlayed(players: TwelvePlayer[]): boolean {
  return players.every((player) => {
    if (player.hand.length > 0) return false;
    return player.frontPiles.every((pile) => !pile.topCard && !pile.bottomCard);
  });
}

function getRoundCardPoints(players: TwelvePlayer[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const player of players) {
    scores[player.id] = player.capturedCards.reduce((sum, card) => sum + cardPointValue(card), 0);
  }
  return scores;
}

function buildRoundSummary(players: TwelvePlayer[], roundCardPoints: Record<string, number>, gotMostPoint: string | null): string {
  const chunks = players.map((player) => {
    const label = roundCardPoints[player.id] ?? 0;
    return `${player.name}: ${label}`;
  });
  const pointsLine = `Round card points (${chunks.join(' · ')})`;
  if (gotMostPoint === null) {
    return `${pointsLine}. Most-points bonus tied — no one scores it.`;
  }
  const playerName = players.find(player => player.id === gotMostPoint)?.name ?? 'Player';
  return `${pointsLine}. ${playerName} took the most points and earns +1.`;
}

function decideGameWinners(players: TwelvePlayer[], roundCardPoints: Record<string, number>): string[] {
  const contenders = players.filter(player => player.totalScore >= 12);
  if (contenders.length === 0) return [];
  if (contenders.length === 1) return [contenders[0].id];

  let bestRoundPoints = -1;
  for (const contender of contenders) {
    const points = roundCardPoints[contender.id] ?? 0;
    if (points > bestRoundPoints) bestRoundPoints = points;
  }

  const byRoundPoints = contenders.filter(contender => (roundCardPoints[contender.id] ?? 0) === bestRoundPoints);
  if (byRoundPoints.length <= 1) return byRoundPoints.map(player => player.id);

  const bestTotal = Math.max(...byRoundPoints.map(player => player.totalScore));
  return byRoundPoints.filter(player => player.totalScore === bestTotal).map(player => player.id);
}

function allowedPileCounts(playerCount: number): TwelvePileCount[] {
  return ALL_PILE_COUNTS.filter((count) => playerCount * count * 2 <= 36);
}

function resolvePileCount(requested: TwelvePileCount, playerCount: number): TwelvePileCount {
  const allowed = allowedPileCounts(playerCount);
  if (allowed.length === 0) return 3;
  if (allowed.includes(requested)) return requested;
  return allowed[allowed.length - 1];
}

function startRound(
  players: TwelvePlayer[],
  pileCount: TwelvePileCount,
  dealerIndex: number,
  roundNumber: number,
): TwelveState {
  const playerCount = players.length;
  const pilesPerPlayer = resolvePileCount(pileCount, playerCount);
  const deck = shuffle(createDeck());
  const cardsForPiles = playerCount * pilesPerPlayer * 2;
  const cardsForHands = 36 - cardsForPiles;
  const handCardsEach = Math.floor(cardsForHands / playerCount);
  let cursor = 0;

  const dealtPlayers: TwelvePlayer[] = players.map((player) => {
    const frontPiles: FrontPile[] = [];
    for (let i = 0; i < pilesPerPlayer; i++) {
      const bottomCard = deck[cursor++] ?? null;
      const topCard = deck[cursor++] ?? null;
      frontPiles.push({
        bottomCard,
        topCard,
        bottomFaceUp: false,
      });
    }

    const hand = deck.slice(cursor, cursor + handCardsEach);
    cursor += handCardsEach;
    return {
      ...player,
      hand: sortHand(hand),
      frontPiles,
      capturedCards: [],
      shogSuitsCalled: [],
    };
  });

  const leaderIndex = (dealerIndex + 1) % playerCount;
  return {
    players: dealtPlayers,
    pileCount: pilesPerPlayer,
    phase: 'playing',
    dealerIndex,
    leaderIndex,
    currentPlayerIndex: leaderIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 1,
    trumpSuit: null,
    trumpSetterId: null,
    pendingFlip: [],
    lastTrickWinnerId: null,
    roundNumber,
    roundCardPoints: {},
    roundSummary: '',
    gameOver: false,
    winners: [],
  };
}

function endRound(state: TwelveState): TwelveState {
  const roundCardPoints = getRoundCardPoints(state.players);
  const roundValues = Object.values(roundCardPoints);
  const maxPoints = roundValues.length > 0 ? Math.max(...roundValues) : 0;
  const mostPointIds = state.players.filter(player => (roundCardPoints[player.id] ?? 0) === maxPoints).map(player => player.id);
  const gotMostPoint = mostPointIds.length === 1 ? mostPointIds[0] : null;

  const updatedPlayers = state.players.map((player) => {
    let nextScore = player.totalScore;
    if (gotMostPoint === player.id) nextScore += 1;
    if (state.lastTrickWinnerId === player.id) nextScore += 1;
    return {
      ...player,
      totalScore: nextScore,
    };
  });

  const winners = decideGameWinners(updatedPlayers, roundCardPoints);
  return {
    ...state,
    players: updatedPlayers,
    phase: 'round-end',
    roundCardPoints,
    roundSummary: buildRoundSummary(updatedPlayers, roundCardPoints, gotMostPoint),
    gameOver: winners.length > 0,
    winners,
    trickWinner: null,
    currentTrick: [],
    pendingFlip: [],
  };
}

function canSetTrump(state: TwelveState, player: TwelvePlayer): boolean {
  if (state.trumpSuit !== null) return false;
  if (player.totalScore >= 10) return false;
  return suitsWithRoyalPair(player).length > 0;
}

function canCallShog(state: TwelveState, player: TwelvePlayer, suit: Suit): boolean {
  if (state.trumpSuit === null) return false;
  if (player.totalScore >= 11) return false;
  if (player.shogSuitsCalled.includes(suit)) return false;
  if (state.trumpSetterId === player.id && suit === state.trumpSuit) return false;
  return suitsWithRoyalPair(player).includes(suit);
}

export function createTwelveState(players: Player[], options?: { pileCount?: TwelvePileCount }): TwelveState {
  const gamePlayers = players.slice(0, 4);
  const pileCount = resolvePileCount(options?.pileCount ?? 4, gamePlayers.length);
  const initialPlayers: TwelvePlayer[] = gamePlayers.map(player => ({
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    hand: [],
    frontPiles: [],
    capturedCards: [],
    totalScore: 0,
    shogSuitsCalled: [],
  }));
  return startRound(initialPlayers, pileCount, 0, 1);
}

export function processTwelveAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as TwelveState;
  const a = action as TwelveAction;
  if (s.gameOver) return state;

  switch (a.type) {
    case 'set-trump': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(player => player.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      const player = s.players[playerIndex];
      if (!canSetTrump(s, player)) return state;
      if (!suitsWithRoyalPair(player).includes(a.suit)) return state;

      const updatedPlayers = [...s.players];
      updatedPlayers[playerIndex] = {
        ...player,
        totalScore: player.totalScore + 2,
      };

      return {
        ...s,
        players: updatedPlayers,
        trumpSuit: a.suit,
        trumpSetterId: player.id,
      };
    }

    case 'call-shog': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(player => player.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      const player = s.players[playerIndex];
      if (!canCallShog(s, player, a.suit)) return state;

      const updatedPlayers = [...s.players];
      updatedPlayers[playerIndex] = {
        ...player,
        totalScore: player.totalScore + 1,
        shogSuitsCalled: [...player.shogSuitsCalled, a.suit],
      };

      return {
        ...s,
        players: updatedPlayers,
      };
    }

    case 'play-hand-card': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(player => player.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!isLegalPlay(s, playerIndex, a.card, 'hand')) return state;

      const player = s.players[playerIndex];
      const handIndex = player.hand.findIndex(card => cardEquals(card, a.card));
      if (handIndex === -1) return state;
      const updatedHand = [...player.hand];
      updatedHand.splice(handIndex, 1);

      const updatedPlayers = [...s.players];
      updatedPlayers[playerIndex] = { ...player, hand: updatedHand };
      const nextTrick = [...s.currentTrick, { playerId, card: a.card, source: 'hand' as const }];

      if (nextTrick.length === s.players.length) {
        return {
          ...s,
          players: updatedPlayers,
          currentTrick: nextTrick,
          trickWinner: getTrickWinnerPlayerId(nextTrick, s.trumpSuit),
        };
      }

      return {
        ...s,
        players: updatedPlayers,
        currentTrick: nextTrick,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
      };
    }

    case 'play-pile-card': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(player => player.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      const player = s.players[playerIndex];
      const pile = player.frontPiles[a.pileIndex];
      if (!pile) return state;
      const playable = getPilePlayableCard(pile);
      if (!playable) return state;
      if (!isLegalPlay(s, playerIndex, playable.card, 'pile', a.pileIndex)) return state;

      const updatedPiles = [...player.frontPiles];
      const targetPile = { ...updatedPiles[a.pileIndex] };
      const pendingFlip = [...s.pendingFlip];
      if (playable.fromTop) {
        targetPile.topCard = null;
        if (targetPile.bottomCard && !targetPile.bottomFaceUp) {
          pendingFlip.push({ playerId, pileIndex: a.pileIndex });
        }
      } else {
        targetPile.bottomCard = null;
      }
      updatedPiles[a.pileIndex] = targetPile;

      const updatedPlayers = [...s.players];
      updatedPlayers[playerIndex] = { ...player, frontPiles: updatedPiles };
      const nextTrick = [
        ...s.currentTrick,
        {
          playerId,
          card: playable.card,
          source: playable.fromTop ? 'pile-top' as const : 'pile-bottom' as const,
          pileIndex: a.pileIndex,
        },
      ];

      if (nextTrick.length === s.players.length) {
        return {
          ...s,
          players: updatedPlayers,
          currentTrick: nextTrick,
          trickWinner: getTrickWinnerPlayerId(nextTrick, s.trumpSuit),
          pendingFlip,
        };
      }

      return {
        ...s,
        players: updatedPlayers,
        currentTrick: nextTrick,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
        pendingFlip,
      };
    }

    case 'resolve-trick': {
      if (s.phase !== 'playing' || !s.trickWinner) return state;
      const winnerIndex = s.players.findIndex(player => player.id === s.trickWinner);
      if (winnerIndex === -1) return state;

      const updatedPlayers = [...s.players];
      const winner = updatedPlayers[winnerIndex];
      updatedPlayers[winnerIndex] = {
        ...winner,
        capturedCards: [...winner.capturedCards, ...s.currentTrick.map(entry => entry.card)],
      };

      if (allCardsPlayed(updatedPlayers)) {
        return endRound({
          ...s,
          players: updatedPlayers,
          lastTrickWinnerId: s.trickWinner,
        });
      }

      return {
        ...s,
        players: updatedPlayers,
        currentTrick: [],
        trickWinner: null,
        trickNumber: s.trickNumber + 1,
        leaderIndex: winnerIndex,
        currentPlayerIndex: winnerIndex,
        lastTrickWinnerId: s.trickWinner,
        phase: s.pendingFlip.length > 0 ? 'flipping' : 'playing',
      };
    }

    case 'flip-exposed': {
      if (s.phase !== 'flipping') return state;
      let changed = false;
      const updatedPlayers = s.players.map((player) => {
        const playerFlipIndexes = s.pendingFlip.filter(item => item.playerId === player.id).map(item => item.pileIndex);
        if (playerFlipIndexes.length === 0) return player;
        const frontPiles = player.frontPiles.map((pile, index) => {
          if (!playerFlipIndexes.includes(index)) return pile;
          if (pile.bottomFaceUp || !pile.bottomCard || pile.topCard) return pile;
          changed = true;
          return { ...pile, bottomFaceUp: true };
        });
        return { ...player, frontPiles };
      });
      if (!changed) {
        return { ...s, pendingFlip: [], phase: 'playing' };
      }
      return {
        ...s,
        players: updatedPlayers,
        pendingFlip: [],
        phase: 'playing',
      };
    }

    case 'start-next-round': {
      if (s.phase !== 'round-end' || s.gameOver) return state;
      const nextDealer = (s.dealerIndex + 1) % s.players.length;
      return startRound(s.players, s.pileCount, nextDealer, s.roundNumber + 1);
    }
  }

  return state;
}

export function isTwelveOver(state: unknown): boolean {
  return (state as TwelveState).gameOver;
}

function chooseBotCard(state: TwelveState, playerIndex: number): { type: 'hand'; card: Card } | { type: 'pile'; pileIndex: number } | null {
  const player = state.players[playerIndex];
  if (!player) return null;

  const options = listPlayableCards(player).filter((entry) => {
    if (entry.source === 'hand') return isLegalPlay(state, playerIndex, entry.card, 'hand');
    return isLegalPlay(state, playerIndex, entry.card, 'pile', entry.pileIndex);
  });
  if (options.length === 0) return null;

  const sorted = [...options].sort((a, b) => a.card.rank - b.card.rank);
  const chosen = sorted[0];
  if (chosen.source === 'hand') return { type: 'hand', card: chosen.card };
  return { type: 'pile', pileIndex: chosen.pileIndex ?? 0 };
}

export function runTwelveBotTurn(state: unknown): unknown {
  const s = state as TwelveState;
  if (s.gameOver || s.phase === 'round-end' || s.trickWinner) return state;
  if (s.phase === 'flipping') {
    return processTwelveAction(s, { type: 'flip-exposed' }, '');
  }

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer?.isBot) return state;

  if (s.trumpSuit === null && currentPlayer.totalScore <= 9) {
    const pairs = suitsWithRoyalPair(currentPlayer);
    if (pairs.length > 0 && Math.random() < 0.55) {
      return processTwelveAction(s, { type: 'set-trump', suit: pairs[0] }, currentPlayer.id);
    }
  }

  if (s.trumpSuit !== null && currentPlayer.totalScore <= 10) {
    const suits = suitsWithRoyalPair(currentPlayer)
      .filter(suit => !currentPlayer.shogSuitsCalled.includes(suit))
      .filter(suit => !(s.trumpSetterId === currentPlayer.id && suit === s.trumpSuit));
    if (suits.length > 0 && Math.random() < 0.45) {
      return processTwelveAction(s, { type: 'call-shog', suit: suits[0] }, currentPlayer.id);
    }
  }

  const chosen = chooseBotCard(s, s.currentPlayerIndex);
  if (!chosen) return state;
  if (chosen.type === 'hand') {
    return processTwelveAction(s, { type: 'play-hand-card', card: chosen.card }, currentPlayer.id);
  }
  return processTwelveAction(s, { type: 'play-pile-card', pileIndex: chosen.pileIndex }, currentPlayer.id);
}
