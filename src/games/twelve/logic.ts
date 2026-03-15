import type { Player, TwelvePileCount } from '../../networking/types';
import type { Card, FrontPile, Rank, Suit, TwelveAction, TwelvePlayer, TwelveState } from './types';
import { cardEquals, cardPointValue, getPilePlayableCard, getTrickWinnerPlayerId, isLegalPlay, listPlayableCards, rankStrength, suitsWithRoyalPair } from './rules';

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
    return rankStrength(a.rank) - rankStrength(b.rank);
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

export function getTeammateIndex(playerIndex: number, playerCount: number): number | null {
  if (playerCount !== 4) return null;
  return (playerIndex + 2) % 4;
}

function getTeammateId(players: TwelvePlayer[], playerId: string): string | null {
  if (players.length !== 4) return null;
  const idx = players.findIndex(p => p.id === playerId);
  if (idx === -1) return null;
  return players[(idx + 2) % 4]?.id ?? null;
}

export function getTeamRoundCardPoints(players: TwelvePlayer[], perPlayer: Record<string, number>): [number, number] {
  const team0 = (perPlayer[players[0]?.id] ?? 0) + (perPlayer[players[2]?.id] ?? 0);
  const team1 = (perPlayer[players[1]?.id] ?? 0) + (perPlayer[players[3]?.id] ?? 0);
  return [team0, team1];
}

function buildRoundSummary(
  players: TwelvePlayer[],
  roundCardPoints: Record<string, number>,
  gotMostPoint: string | null,
  lastTrickWinnerId: string | null,
): string {
  if (players.length === 4) {
    const teamPoints = getTeamRoundCardPoints(players, roundCardPoints);
    const team0Names = `${players[0].name} & ${players[2].name}`;
    const team1Names = `${players[1].name} & ${players[3].name}`;
    const pointsLine = `Team card points (${team0Names}: ${teamPoints[0]} · ${team1Names}: ${teamPoints[1]})`;
    const mostPointsLine = gotMostPoint === null
      ? 'Most-points bonus tied — no team scores it.'
      : (() => {
          const winnerIdx = players.findIndex(p => p.id === gotMostPoint);
          const teamNames = winnerIdx % 2 === 0 ? team0Names : team1Names;
          return `${teamNames} took the most points and earn +1.`;
        })();
    const lastTrickLine = lastTrickWinnerId === null
      ? 'Last-trick bonus unavailable.'
      : (() => {
          const winnerIdx = players.findIndex(p => p.id === lastTrickWinnerId);
          const teamNames = winnerIdx % 2 === 0 ? team0Names : team1Names;
          return `${players.find(p => p.id === lastTrickWinnerId)?.name ?? 'Player'} won the last trick, earning +1 for ${teamNames}.`;
        })();
    return `${pointsLine}. ${mostPointsLine} ${lastTrickLine}`;
  }

  const chunks = players.map((player) => {
    const label = roundCardPoints[player.id] ?? 0;
    return `${player.name}: ${label}`;
  });
  const pointsLine = `Round card points (${chunks.join(' · ')})`;
  const mostPointsLine = gotMostPoint === null
    ? 'Most-points bonus tied — no one scores it.'
    : `${players.find(player => player.id === gotMostPoint)?.name ?? 'Player'} took the most points and earns +1.`;
  const lastTrickLine = lastTrickWinnerId === null
    ? 'Last-trick bonus unavailable.'
    : `${players.find(player => player.id === lastTrickWinnerId)?.name ?? 'Player'} won the last trick and earns +1.`;
  return `${pointsLine}. ${mostPointsLine} ${lastTrickLine}`;
}

function decideGameWinners(players: TwelvePlayer[], roundCardPoints: Record<string, number>): string[] {
  if (players.length === 4) {
    const team0Score = players[0].totalScore;
    const team1Score = players[1].totalScore;
    const team0Qualifies = team0Score >= 12;
    const team1Qualifies = team1Score >= 12;
    if (!team0Qualifies && !team1Qualifies) return [];
    if (team0Qualifies && !team1Qualifies) return [players[0].id, players[2].id];
    if (team1Qualifies && !team0Qualifies) return [players[1].id, players[3].id];
    const teamPoints = getTeamRoundCardPoints(players, roundCardPoints);
    if (teamPoints[0] > teamPoints[1]) return [players[0].id, players[2].id];
    if (teamPoints[1] > teamPoints[0]) return [players[1].id, players[3].id];
    if (team0Score > team1Score) return [players[0].id, players[2].id];
    if (team1Score > team0Score) return [players[1].id, players[3].id];
    return [players[0].id, players[2].id, players[1].id, players[3].id];
  }

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
      tjogSuitsCalled: [],
    };
  });

  const leaderIndex = (dealerIndex + 1) % playerCount;
  return {
    players: dealtPlayers,
    pileCount: pilesPerPlayer,
    phase: 'playing',
    announcement: null,
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
    knownVoidSuitsByPlayer: {},
    roundCardPoints: {},
    roundSummary: '',
    gameOver: false,
    winners: [],
  };
}

function endRound(state: TwelveState): TwelveState {
  const roundCardPoints = getRoundCardPoints(state.players);
  const isTeam = state.players.length === 4;

  let gotMostPoint: string | null = null;
  let updatedPlayers: TwelvePlayer[];

  if (isTeam) {
    const teamPoints = getTeamRoundCardPoints(state.players, roundCardPoints);
    if (teamPoints[0] > teamPoints[1]) {
      gotMostPoint = state.players[0].id;
    } else if (teamPoints[1] > teamPoints[0]) {
      gotMostPoint = state.players[1].id;
    }

    const lastTrickWinnerIndex = state.lastTrickWinnerId
      ? state.players.findIndex(p => p.id === state.lastTrickWinnerId)
      : -1;
    const lastTrickTeam = lastTrickWinnerIndex >= 0 ? lastTrickWinnerIndex % 2 : -1;
    const mostPointsTeam = gotMostPoint !== null
      ? state.players.findIndex(p => p.id === gotMostPoint) % 2
      : -1;

    const teamBonus = [0, 0];
    if (mostPointsTeam >= 0) teamBonus[mostPointsTeam] += 1;
    if (lastTrickTeam >= 0) teamBonus[lastTrickTeam] += 1;

    updatedPlayers = state.players.map((player, i) => ({
      ...player,
      totalScore: player.totalScore + teamBonus[i % 2],
    }));
  } else {
    const roundValues = Object.values(roundCardPoints);
    const maxPoints = roundValues.length > 0 ? Math.max(...roundValues) : 0;
    const mostPointIds = state.players
      .filter(player => (roundCardPoints[player.id] ?? 0) === maxPoints)
      .map(player => player.id);
    gotMostPoint = mostPointIds.length === 1 ? mostPointIds[0] : null;

    updatedPlayers = state.players.map((player) => {
      let nextScore = player.totalScore;
      if (gotMostPoint === player.id) nextScore += 1;
      if (state.lastTrickWinnerId === player.id) nextScore += 1;
      return { ...player, totalScore: nextScore };
    });
  }

  const winners = decideGameWinners(updatedPlayers, roundCardPoints);
  return {
    ...state,
    players: updatedPlayers,
    phase: 'round-end',
    roundCardPoints,
    roundSummary: buildRoundSummary(updatedPlayers, roundCardPoints, gotMostPoint, state.lastTrickWinnerId),
    gameOver: winners.length > 0,
    winners,
    trickWinner: null,
    currentTrick: [],
    pendingFlip: [],
  };
}

function canSetTrump(state: TwelveState, player: TwelvePlayer): boolean {
  if (state.currentTrick.length !== 0) return false;
  if (state.lastTrickWinnerId !== player.id) return false;
  if (state.trumpSuit !== null) return false;
  if (player.totalScore >= 10) return false;
  return suitsWithRoyalPair(player).length > 0;
}

function canCallTjog(state: TwelveState, player: TwelvePlayer, suit: Suit): boolean {
  if (state.currentTrick.length !== 0) return false;
  if (state.lastTrickWinnerId !== player.id) return false;
  if (state.trumpSuit === null) return false;
  if (player.totalScore >= 11) return false;
  if (player.tjogSuitsCalled.includes(suit)) return false;
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
    tjogSuitsCalled: [],
  }));
  return startRound(initialPlayers, pileCount, 0, 1);
}

export function processTwelveAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as TwelveState;
  const a = action as TwelveAction;
  if (s.phase === 'game-over') return state;
  if (s.gameOver && a.type !== 'show-final-results') return state;

  switch (a.type) {
    case 'set-trump': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(player => player.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      const player = s.players[playerIndex];
      if (!canSetTrump(s, player)) return state;
      if (!suitsWithRoyalPair(player).includes(a.suit)) return state;

      const newScore = player.totalScore + 2;
      const updatedPlayers = [...s.players];
      updatedPlayers[playerIndex] = { ...player, totalScore: newScore };
      const trumpTeammateIdx = getTeammateIndex(playerIndex, s.players.length);
      if (trumpTeammateIdx !== null) {
        updatedPlayers[trumpTeammateIdx] = { ...updatedPlayers[trumpTeammateIdx], totalScore: newScore };
      }

      return {
        ...s,
        players: updatedPlayers,
        phase: 'announcement',
        announcement: {
          kind: 'set-trump',
          playerId: player.id,
          suit: a.suit,
        },
        trumpSuit: a.suit,
        trumpSetterId: player.id,
      };
    }

    case 'call-tjog': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(player => player.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      const player = s.players[playerIndex];
      if (!canCallTjog(s, player, a.suit)) return state;

      const tjogNewScore = player.totalScore + 1;
      const updatedPlayers = [...s.players];
      updatedPlayers[playerIndex] = {
        ...player,
        totalScore: tjogNewScore,
        tjogSuitsCalled: [...player.tjogSuitsCalled, a.suit],
      };
      const tjogTeammateIdx = getTeammateIndex(playerIndex, s.players.length);
      if (tjogTeammateIdx !== null) {
        updatedPlayers[tjogTeammateIdx] = { ...updatedPlayers[tjogTeammateIdx], totalScore: tjogNewScore };
      }

      return {
        ...s,
        players: updatedPlayers,
        phase: 'announcement',
        announcement: {
          kind: 'call-tjog',
          playerId: player.id,
          suit: a.suit,
        },
      };
    }

    case 'finish-announcement': {
      if (s.phase !== 'announcement') return state;
      return {
        ...s,
        phase: 'playing',
        announcement: null,
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
      const knownVoidSuitsByPlayer = updateKnownVoidSuitsAfterPlay(s, playerId, a.card);

      if (nextTrick.length === s.players.length) {
        return {
          ...s,
          players: updatedPlayers,
          currentTrick: nextTrick,
          knownVoidSuitsByPlayer,
          trickWinner: getTrickWinnerPlayerId(nextTrick, s.trumpSuit),
        };
      }

      return {
        ...s,
        players: updatedPlayers,
        currentTrick: nextTrick,
        knownVoidSuitsByPlayer,
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
      const knownVoidSuitsByPlayer = updateKnownVoidSuitsAfterPlay(s, playerId, playable.card);

      if (nextTrick.length === s.players.length) {
        return {
          ...s,
          players: updatedPlayers,
          currentTrick: nextTrick,
          knownVoidSuitsByPlayer,
          trickWinner: getTrickWinnerPlayerId(nextTrick, s.trumpSuit),
          pendingFlip,
        };
      }

      return {
        ...s,
        players: updatedPlayers,
        currentTrick: nextTrick,
        knownVoidSuitsByPlayer,
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

    case 'show-final-results': {
      if (s.phase !== 'round-end' || !s.gameOver) return state;
      return {
        ...s,
        phase: 'game-over',
      };
    }
  }

  return state;
}

export function getTwelveWinners(state: unknown): string[] {
  return (state as TwelveState).winners;
}

export function isTwelveOver(state: unknown): boolean {
  return (state as TwelveState).phase === 'game-over';
}

interface BotPlayOption {
  card: Card;
  source: 'hand' | 'pile';
  pileIndex?: number;
  fromTop?: boolean;
}

interface EndgameInfo {
  remainingCards: number;
  remainingTricks: number;
  isLate: boolean;
  isVeryLate: boolean;
}

function createSuitCounter(): Record<Suit, number> {
  return { clubs: 0, diamonds: 0, spades: 0, hearts: 0 };
}

function deserializeKnownVoidSuits(state: TwelveState): Record<string, Set<Suit>> {
  const byPlayer: Record<string, Set<Suit>> = {};
  for (const [playerId, suits] of Object.entries(state.knownVoidSuitsByPlayer ?? {})) {
    byPlayer[playerId] = new Set(suits);
  }
  return byPlayer;
}

function serializeKnownVoidSuits(byPlayer: Record<string, Set<Suit>>): Record<string, Suit[]> {
  const serialized: Record<string, Suit[]> = {};
  for (const [playerId, suits] of Object.entries(byPlayer)) {
    const ordered = SUITS.filter(suit => suits.has(suit));
    if (ordered.length > 0) serialized[playerId] = ordered;
  }
  return serialized;
}

function updateKnownVoidSuitsAfterPlay(state: TwelveState, playerId: string, playedCard: Card): Record<string, Suit[]> {
  const byPlayer = deserializeKnownVoidSuits(state);
  const knownVoids = byPlayer[playerId] ?? new Set<Suit>();

  if (state.currentTrick.length > 0) {
    const leadSuit = state.currentTrick[0].card.suit;
    if (playedCard.suit !== leadSuit) {
      knownVoids.add(leadSuit);
    } else {
      knownVoids.delete(leadSuit);
    }
  }

  // Seeing a player play a suit means they are not void in that suit anymore.
  knownVoids.delete(playedCard.suit);
  byPlayer[playerId] = knownVoids;
  return serializeKnownVoidSuits(byPlayer);
}

function countRemainingCards(player: TwelvePlayer): number {
  let count = player.hand.length;
  for (const pile of player.frontPiles) {
    if (pile.topCard) count += 1;
    if (pile.bottomCard) count += 1;
  }
  return count;
}

function estimateEndgame(state: TwelveState): EndgameInfo {
  const remainingCards = state.players.reduce((sum, player) => sum + countRemainingCards(player), 0);
  const remainingTricks = Math.ceil(remainingCards / Math.max(1, state.players.length));
  return {
    remainingCards,
    remainingTricks,
    isLate: remainingTricks <= 3,
    isVeryLate: remainingTricks <= 2,
  };
}

function getCurrentTrickPointValue(state: TwelveState): number {
  return state.currentTrick.reduce((sum, entry) => sum + cardPointValue(entry.card), 0);
}

function getCurrentTrickLeaderId(state: TwelveState): string | null {
  if (state.currentTrick.length === 0) return null;
  return getTrickWinnerPlayerId(state.currentTrick, state.trumpSuit);
}

function getVisibleCards(player: TwelvePlayer): Card[] {
  const cards: Card[] = [];
  for (const pile of player.frontPiles) {
    if (pile.topCard) cards.push(pile.topCard);
    if (pile.bottomCard && pile.bottomFaceUp && !pile.topCard) cards.push(pile.bottomCard);
  }
  return cards;
}

function getVisibleSuitCounts(player: TwelvePlayer): Record<Suit, number> {
  const counts = createSuitCounter();
  for (const card of getVisibleCards(player)) {
    counts[card.suit] += 1;
  }
  return counts;
}

function getPublicRoyalPairSuits(player: TwelvePlayer): Suit[] {
  const cards = getVisibleCards(player);
  return SUITS.filter((suit) => {
    const hasQ = cards.some(card => card.suit === suit && card.rank === 12);
    const hasK = cards.some(card => card.suit === suit && card.rank === 13);
    return hasQ && hasK;
  });
}

function getKnownVoidSuits(state: TwelveState): Record<string, Set<Suit>> {
  const voids = deserializeKnownVoidSuits(state);
  if (state.currentTrick.length === 0) return voids;
  const leadSuit = state.currentTrick[0].card.suit;
  for (const entry of state.currentTrick.slice(1)) {
    if (entry.card.suit !== leadSuit) {
      voids[entry.playerId] = voids[entry.playerId] ?? new Set<Suit>();
      voids[entry.playerId].add(leadSuit);
    }
  }
  return voids;
}

function getRoundRaceInfo(state: TwelveState, myPlayerId: string): {
  myPoints: number;
  leaderId: string | null;
  leaderPoints: number;
  isUniqueLeader: boolean;
} {
  const roundPoints = getRoundCardPoints(state.players);
  const myPoints = roundPoints[myPlayerId] ?? 0;
  let leaderId: string | null = null;
  let leaderPoints = -1;
  let ties = 0;
  for (const player of state.players) {
    const points = roundPoints[player.id] ?? 0;
    if (points > leaderPoints) {
      leaderPoints = points;
      leaderId = player.id;
      ties = 1;
    } else if (points === leaderPoints) {
      ties += 1;
    }
  }
  return {
    myPoints,
    leaderId,
    leaderPoints: Math.max(0, leaderPoints),
    isUniqueLeader: ties === 1 && leaderId !== null,
  };
}

function estimateDeclarationThreat(state: TwelveState, player: TwelvePlayer, isCurrentLeader: boolean): number {
  if (state.trumpSuit !== null || player.totalScore >= 10) return 0;
  let threat = 0;
  const publicPairs = getPublicRoyalPairSuits(player);
  if (publicPairs.length > 0) threat += 3 + publicPairs.length;
  if (isCurrentLeader) threat += 2;
  if (player.totalScore <= 7) threat += 1;
  return threat;
}

function findDangerousSetTrumpOpponentId(state: TwelveState, myPlayerId: string): string | null {
  if (state.trumpSuit !== null) return null;
  const currentLeaderId = getCurrentTrickLeaderId(state);
  const myTeammateId = getTeammateId(state.players, myPlayerId);
  let bestId: string | null = null;
  let bestScore = 0;
  for (const player of state.players) {
    if (player.id === myPlayerId || player.id === myTeammateId) continue;
    const score = estimateDeclarationThreat(state, player, player.id === currentLeaderId);
    if (score > bestScore) {
      bestScore = score;
      bestId = player.id;
    }
  }
  return bestId;
}

function findTrumpPressureTargetId(
  state: TwelveState,
  myPlayerId: string,
  knownVoidsByPlayer: Record<string, Set<Suit>>,
): string | null {
  if (state.trumpSuit === null) return null;
  const trumpSuit = state.trumpSuit;
  const myTeammateId = getTeammateId(state.players, myPlayerId);
  let bestId: string | null = null;
  let bestScore = 0;
  for (const opponent of state.players) {
    if (opponent.id === myPlayerId || opponent.id === myTeammateId) continue;
    const knownVoids = knownVoidsByPlayer[opponent.id] ?? new Set<Suit>();
    const nonTrumpVoidCount = SUITS.filter(suit => suit !== trumpSuit && knownVoids.has(suit)).length;
    if (nonTrumpVoidCount === 0) continue;
    const visibleTrump = getVisibleSuitCounts(opponent)[trumpSuit];
    const score = nonTrumpVoidCount * 3 + visibleTrump * 1.6;
    if (score > bestScore) {
      bestScore = score;
      bestId = opponent.id;
    }
  }
  return bestId;
}

function listLegalBotOptions(state: TwelveState, playerIndex: number): BotPlayOption[] {
  const player = state.players[playerIndex];
  if (!player) return [];
  return listPlayableCards(player).filter((entry) => {
    if (entry.source === 'hand') return isLegalPlay(state, playerIndex, entry.card, 'hand');
    return isLegalPlay(state, playerIndex, entry.card, 'pile', entry.pileIndex);
  }).map((entry) => ({
    card: entry.card,
    source: entry.source,
    pileIndex: entry.pileIndex,
    fromTop: entry.fromTop,
  }));
}

function scorePileVsHand(option: BotPlayOption, player: TwelvePlayer): number {
  if (option.source === 'hand') return 0.7;
  const pile = player.frontPiles[option.pileIndex ?? -1];
  if (!pile) return 0;
  let score = -0.4;
  if (option.fromTop && pile.bottomCard && !pile.bottomFaceUp) {
    score -= 1.5;
    score -= cardPointValue(pile.bottomCard) * 0.35;
    score -= rankStrength(pile.bottomCard.rank) * 0.2;
    if (pile.bottomCard.rank === 12 || pile.bottomCard.rank === 13) score -= 0.8;
  } else if (option.fromTop === false) {
    score += 0.8;
  }
  return score;
}

function wouldLeadCurrentTrick(state: TwelveState, player: TwelvePlayer, option: BotPlayOption): boolean {
  const next = [...state.currentTrick, { playerId: player.id, card: option.card }];
  return getTrickWinnerPlayerId(next, state.trumpSuit) === player.id;
}

function scoreLeadOption(
  state: TwelveState,
  playerIndex: number,
  option: BotPlayOption,
  dangerousOpponentId: string | null,
  trumpPressureTargetId: string | null,
  knownVoidsByPlayer: Record<string, Set<Suit>>,
  endgame: EndgameInfo,
  roundRace: ReturnType<typeof getRoundRaceInfo>,
): number {
  const player = state.players[playerIndex];
  const card = option.card;
  let score = 0;
  score -= rankStrength(card.rank) * 0.8;
  score -= cardPointValue(card) * 0.45;

  if (state.trumpSuit !== null) {
    if (card.suit === state.trumpSuit) {
      score += 1.2 + rankStrength(card.rank) * 0.25;
    } else {
      score -= 0.6;
    }
  }

  if (dangerousOpponentId) {
    const dangerousPlayer = state.players.find(p => p.id === dangerousOpponentId);
    if (dangerousPlayer) {
      const visibleCounts = getVisibleSuitCounts(dangerousPlayer);
      score += visibleCounts[card.suit] * 1.25;
    }
  }

  if (state.trumpSuit !== null && trumpPressureTargetId) {
    const targetVoids = knownVoidsByPlayer[trumpPressureTargetId] ?? new Set<Suit>();
    const pressureSuits = SUITS.filter(suit => suit !== state.trumpSuit && targetVoids.has(suit));
    const target = state.players.find(player => player.id === trumpPressureTargetId);
    const visibleTrump = target ? getVisibleSuitCounts(target)[state.trumpSuit] : 0;

    if (pressureSuits.includes(card.suit)) {
      score += 4.8 + visibleTrump * 1.4;
      score += (8 - rankStrength(card.rank)) * 0.55;
      score -= cardPointValue(card) * 0.25;
    }

    if (pressureSuits.length > 0 && card.suit === state.trumpSuit) {
      score -= 2.2;
    }
  }

  if (state.trumpSuit === null && player.totalScore <= 9 && suitsWithRoyalPair(player).length > 0) {
    score += rankStrength(card.rank) * 0.35;
  }

  if (endgame.isLate) score += rankStrength(card.rank) * 0.75;
  if (endgame.isVeryLate) score += cardPointValue(card) * 0.6;
  if (roundRace.isUniqueLeader && roundRace.leaderId === player.id) {
    score += cardPointValue(card) * 0.2;
  }

  score += scorePileVsHand(option, player);
  return score;
}

function scoreFollowSuitOption(
  state: TwelveState,
  playerIndex: number,
  option: BotPlayOption,
  dangerousOpponentId: string | null,
  endgame: EndgameInfo,
  roundRace: ReturnType<typeof getRoundRaceInfo>,
): number {
  const player = state.players[playerIndex];
  const card = option.card;
  const trickPoints = getCurrentTrickPointValue(state);
  const currentLeader = getCurrentTrickLeaderId(state);
  const dangerousLeads = !!dangerousOpponentId && currentLeader === dangerousOpponentId;
  const wouldLead = wouldLeadCurrentTrick(state, player, option);
  let score = 0;

  if (wouldLead) {
    score -= 3.5;
    score -= cardPointValue(card) * 0.4;
    score -= rankStrength(card.rank) * 0.35;
    if (dangerousLeads) score += 8;
    if (trickPoints >= 10) score += 4 + trickPoints * 0.25;
    if (roundRace.isUniqueLeader && roundRace.leaderId === currentLeader) score += 2.2;
    if (state.trumpSuit === null && player.totalScore <= 9 && suitsWithRoyalPair(player).length > 0) score += 3;
    if (endgame.isLate) score += 8;
    if (endgame.isVeryLate) score += 3;
  } else {
    score += rankStrength(card.rank) * 0.6;
    score -= cardPointValue(card) * 0.15;
    if (endgame.isVeryLate) score -= 2;
  }

  if (
    state.trumpSuit === null
    && (card.rank === 12 || card.rank === 13)
    && suitsWithRoyalPair(player).includes(card.suit)
  ) {
    score -= 1.2;
  }

  score += scorePileVsHand(option, player);
  return score;
}

function scoreDiscardOption(
  state: TwelveState,
  playerIndex: number,
  option: BotPlayOption,
  dangerousOpponentId: string | null,
  endgame: EndgameInfo,
  roundRace: ReturnType<typeof getRoundRaceInfo>,
): number {
  const player = state.players[playerIndex];
  const card = option.card;
  const trickPoints = getCurrentTrickPointValue(state);
  const currentLeader = getCurrentTrickLeaderId(state);
  const dangerousLeads = !!dangerousOpponentId && currentLeader === dangerousOpponentId;
  const wouldLead = wouldLeadCurrentTrick(state, player, option);
  let score = 0;

  if (wouldLead) {
    score -= 2;
    score -= rankStrength(card.rank) * 0.3;
    if (dangerousLeads) score += 9;
    if (trickPoints > 0) score += trickPoints * 0.5;
    if (roundRace.isUniqueLeader && roundRace.leaderId === currentLeader) score += 2.6;
    if (endgame.isLate) score += 8;
    if (endgame.isVeryLate) score += 3.2;
  } else {
    score += rankStrength(card.rank) * 0.7;
    score += cardPointValue(card) * 0.4;
    if (state.trumpSuit !== null && card.suit === state.trumpSuit) score -= 1;

    if (
      state.trumpSuit === null
      && player.totalScore <= 10
      && (card.rank === 12 || card.rank === 13)
      && suitsWithRoyalPair(player).includes(card.suit)
    ) {
      score -= 2.5;
    }

    if (endgame.isVeryLate) score -= 1.5;
  }

  score += scorePileVsHand(option, player);
  return score;
}

function scoreForcedTrumpOption(
  state: TwelveState,
  playerIndex: number,
  option: BotPlayOption,
  dangerousOpponentId: string | null,
  endgame: EndgameInfo,
  roundRace: ReturnType<typeof getRoundRaceInfo>,
): number {
  const player = state.players[playerIndex];
  const card = option.card;
  const trickPoints = getCurrentTrickPointValue(state);
  const currentLeader = getCurrentTrickLeaderId(state);
  const dangerousLeads = !!dangerousOpponentId && currentLeader === dangerousOpponentId;
  const wouldLead = wouldLeadCurrentTrick(state, player, option);
  let score = 0;

  // Forced trumps usually want to be as cheap as possible.
  score -= rankStrength(card.rank) * 0.95;
  score -= cardPointValue(card) * 0.2;

  if (wouldLead) {
    score -= 1.6;
    if (dangerousLeads) score += 8.5;
    if (trickPoints >= 10) score += 3.2 + trickPoints * 0.3;
    if (roundRace.isUniqueLeader && roundRace.leaderId === currentLeader) score += 2.4;
    if (endgame.isLate) score += 5.2;
    if (endgame.isVeryLate) score += 2.3;
  } else {
    score += 0.8;
    if (endgame.isVeryLate) score -= 1.3;
  }

  score += scorePileVsHand(option, player);
  return score;
}

function pickBestScoredOption(
  options: BotPlayOption[],
  scorer: (option: BotPlayOption) => number,
): BotPlayOption | null {
  if (options.length === 0) return null;
  let best = options[0];
  let bestScore = scorer(best);
  for (const option of options.slice(1)) {
    const score = scorer(option);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best;
}

function chooseBotCard(state: TwelveState, playerIndex: number): { type: 'hand'; card: Card } | { type: 'pile'; pileIndex: number } | null {
  const player = state.players[playerIndex];
  if (!player) return null;

  const options = listLegalBotOptions(state, playerIndex);
  if (options.length === 0) return null;

  const voidInfo = getKnownVoidSuits(state);
  const dangerousOpponentId = findDangerousSetTrumpOpponentId(state, player.id);
  const trumpPressureTargetId = findTrumpPressureTargetId(state, player.id, voidInfo);
  const endgame = estimateEndgame(state);
  const roundRace = getRoundRaceInfo(state, player.id);
  const leadSuit = state.currentTrick[0]?.card.suit ?? null;

  let chosen: BotPlayOption | null = null;
  if (!leadSuit) {
    chosen = pickBestScoredOption(
      options,
      option => scoreLeadOption(
        state,
        playerIndex,
        option,
        dangerousOpponentId,
        trumpPressureTargetId,
        voidInfo,
        endgame,
        roundRace,
      ),
    );
  } else {
    const followSuitOptions = options.filter(option => option.card.suit === leadSuit);
    if (followSuitOptions.length > 0) {
      chosen = pickBestScoredOption(
        followSuitOptions,
        option => scoreFollowSuitOption(state, playerIndex, option, dangerousOpponentId, endgame, roundRace),
      );
    } else {
      const forcedTrump = !!state.trumpSuit && options.every(option => option.card.suit === state.trumpSuit);
      chosen = pickBestScoredOption(
        options,
        option => (
          forcedTrump
            ? scoreForcedTrumpOption(state, playerIndex, option, dangerousOpponentId, endgame, roundRace)
            : scoreDiscardOption(state, playerIndex, option, dangerousOpponentId, endgame, roundRace)
        ),
      );
    }
  }

  if (!chosen) return null;

  if (chosen.source === 'hand') return { type: 'hand', card: chosen.card };
  return { type: 'pile', pileIndex: chosen.pileIndex ?? 0 };
}

function scoreSetTrumpSuit(state: TwelveState, playerIndex: number, suit: Suit): number {
  const player = state.players[playerIndex];
  const pairs = suitsWithRoyalPair(player);
  if (!pairs.includes(suit)) return Number.NEGATIVE_INFINITY;
  const playable = listPlayableCards(player).map(entry => entry.card);
  const inSuit = playable.filter(card => card.suit === suit);
  const controlValue = inSuit.reduce((sum, card) => sum + rankStrength(card.rank), 0);
  const futureTjogPairs = pairs.filter(pairSuit => pairSuit !== suit).length;
  const preservationCost = inSuit.reduce((sum, card) => sum + cardPointValue(card) + rankStrength(card.rank) * 0.4, 0);
  const dangerousOpponentId = findDangerousSetTrumpOpponentId(state, player.id);
  const immediateFinish = player.totalScore + 2 >= 12;
  const runwayPenalty = player.totalScore === 9 ? 4.2 : player.totalScore === 8 ? 2.2 : 0;
  return 10
    + controlValue * 0.12
    + futureTjogPairs * 2.2
    - (pairs.length > 1 ? preservationCost * 0.14 : 0)
    + (dangerousOpponentId ? 3.2 : 0)
    + (immediateFinish ? 8 : 0)
    - runwayPenalty;
}

function chooseSetTrumpSuit(state: TwelveState, playerIndex: number): { suit: Suit; score: number } | null {
  const player = state.players[playerIndex];
  const pairs = suitsWithRoyalPair(player);
  if (pairs.length === 0) return null;
  let bestSuit = pairs[0];
  let bestScore = scoreSetTrumpSuit(state, playerIndex, bestSuit);
  for (const suit of pairs.slice(1)) {
    const score = scoreSetTrumpSuit(state, playerIndex, suit);
    if (score > bestScore) {
      bestSuit = suit;
      bestScore = score;
    }
  }
  return { suit: bestSuit, score: bestScore };
}

function scoreTjogSuit(state: TwelveState, playerIndex: number, suit: Suit): number {
  const player = state.players[playerIndex];
  if (!canCallTjog(state, player, suit)) return Number.NEGATIVE_INFINITY;
  const endgame = estimateEndgame(state);
  let score = 6.5;
  if (player.totalScore === 10) score += 2.2;
  if (player.totalScore + 1 >= 12) score += 4.2;
  if (endgame.isLate) score += 1.4;
  return score;
}

function chooseTjogSuit(state: TwelveState, playerIndex: number): { suit: Suit; score: number } | null {
  const player = state.players[playerIndex];
  const suits = suitsWithRoyalPair(player)
    .filter(suit => !player.tjogSuitsCalled.includes(suit))
    .filter(suit => !(state.trumpSetterId === player.id && suit === state.trumpSuit));
  if (suits.length === 0) return null;
  let bestSuit = suits[0];
  let bestScore = scoreTjogSuit(state, playerIndex, bestSuit);
  for (const suit of suits.slice(1)) {
    const score = scoreTjogSuit(state, playerIndex, suit);
    if (score > bestScore) {
      bestSuit = suit;
      bestScore = score;
    }
  }
  return { suit: bestSuit, score: bestScore };
}

export function runTwelveBotTurn(state: unknown): unknown {
  const s = state as TwelveState;
  if (s.phase === 'game-over' || s.gameOver || s.phase === 'round-end' || s.trickWinner) return state;
  if (s.phase === 'flipping') {
    return processTwelveAction(s, { type: 'flip-exposed' }, '');
  }

  const currentPlayer = s.players[s.currentPlayerIndex];
  if (!currentPlayer?.isBot) return state;

  if (s.currentTrick.length === 0 && canSetTrump(s, currentPlayer)) {
    const choice = chooseSetTrumpSuit(s, s.currentPlayerIndex);
    if (choice && choice.score >= 8.5) {
      return processTwelveAction(s, { type: 'set-trump', suit: choice.suit }, currentPlayer.id);
    }
  }

  if (s.currentTrick.length === 0 && s.trumpSuit !== null) {
    const choice = chooseTjogSuit(s, s.currentPlayerIndex);
    if (choice && choice.score >= 6) {
      return processTwelveAction(s, { type: 'call-tjog', suit: choice.suit }, currentPlayer.id);
    }
  }

  const chosen = chooseBotCard(s, s.currentPlayerIndex);
  if (!chosen) return state;
  if (chosen.type === 'hand') {
    return processTwelveAction(s, { type: 'play-hand-card', card: chosen.card }, currentPlayer.id);
  }
  return processTwelveAction(s, { type: 'play-pile-card', pileIndex: chosen.pileIndex }, currentPlayer.id);
}
