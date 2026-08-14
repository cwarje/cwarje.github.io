import type { GameStartOptions, Player, TensScoreThreshold } from '../../networking/types';
import type {
  Card,
  FrontPile,
  Rank,
  SelectedCardPlay,
  Suit,
  TensAction,
  TensActionAnnouncement,
  TensPlayOutcome,
  TensPlayer,
  TensState,
} from './types';
import {
  CARDS_PER_PLAYER,
  HAND_CARDS_PER_PLAYER,
  PILES_PER_PLAYER,
} from './types';
import {
  allCardsHeld,
  canPlayRank,
  cardPenaltyPoints,
  cardEquals,
  countCardsHeld,
  deckCountForPlayers,
  isSetClear,
  listLegalPlayGroups,
  playerHasNoCards,
  playRankValue,
  validatePlays,
  wouldPickup,
} from './rules';
import type { PlayableCard } from './rules';

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

function createMultiDeck(playerCount: number): Card[] {
  const deckCount = deckCountForPlayers(playerCount);
  const cards: Card[] = [];
  for (let i = 0; i < deckCount; i++) {
    cards.push(...createDeck());
  }
  return cards;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortCardsByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const rankDelta = playRankValue(a.rank) - playRankValue(b.rank);
    if (rankDelta !== 0) return rankDelta;
    return SUIT_SORT_ORDER[a.suit] - SUIT_SORT_ORDER[b.suit];
  });
}

function sortHand(hand: Card[]): Card[] {
  return sortCardsByRank(hand);
}

function resolveScoreThreshold(options?: GameStartOptions): TensScoreThreshold {
  return options?.tensScoreThreshold ?? 150;
}

function toTensPlayers(players: Player[]): TensPlayer[] {
  return players.map(player => ({
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    hand: [],
    tablePiles: Array.from({ length: PILES_PER_PLAYER }, () => ({
      bottomCard: null,
      topCard: null,
      bottomFaceUp: false,
    })),
    totalScore: 0,
  }));
}

function removeCardFromPlayer(player: TensPlayer, play: SelectedCardPlay): TensPlayer {
  if (play.source === 'hand') {
    const handIndex = player.hand.findIndex(c => cardEquals(c, play.card));
    if (handIndex === -1) return player;
    return {
      ...player,
      hand: sortHand(player.hand.filter((_, i) => i !== handIndex)),
    };
  }

  const pileIndex = play.pileIndex ?? -1;
  const piles = player.tablePiles.map((pile, i) => {
    if (i !== pileIndex) return pile;
    if (play.source === 'pile-top' && pile.topCard && cardEquals(pile.topCard, play.card)) {
      return { ...pile, topCard: null };
    }
    if (play.source === 'pile-bottom' && pile.bottomCard && cardEquals(pile.bottomCard, play.card)) {
      return { ...pile, bottomCard: null, bottomFaceUp: false };
    }
    return pile;
  });

  return { ...player, tablePiles: piles };
}

function advanceToNextPlayer(state: TensState): number {
  return (state.currentPlayerIndex + 1) % state.players.length;
}

function buildRoundSummary(
  players: TensPlayer[],
  roundScores: Record<string, number>,
  outPlayerId: string | null,
): string {
  const outName = outPlayerId
    ? players.find(p => p.id === outPlayerId)?.name ?? 'Player'
    : 'Unknown';
  const chunks = players.map(p => `${p.name}: +${roundScores[p.id] ?? 0}`);
  return `${outName} went out · ${chunks.join(' · ')}`;
}

function getLowestScoreWinners(players: TensPlayer[]): string[] {
  const min = Math.min(...players.map(p => p.totalScore));
  return players.filter(p => p.totalScore === min).map(p => p.id);
}

function hasReachedScoreThreshold(players: TensPlayer[], threshold: TensScoreThreshold): boolean {
  return players.some(p => p.totalScore >= threshold);
}

function startRound(
  players: TensPlayer[],
  dealerIndex: number,
  roundNumber: number,
  scoreThreshold: TensScoreThreshold,
): TensState {
  const playerCount = players.length;
  const deck = shuffle(createMultiDeck(playerCount));
  let cursor = 0;

  const dealtPlayers: TensPlayer[] = players.map((player) => {
    const tablePiles: FrontPile[] = [];
    for (let i = 0; i < PILES_PER_PLAYER; i++) {
      const bottomCard = deck[cursor++] ?? null;
      const topCard = deck[cursor++] ?? null;
      tablePiles.push({
        bottomCard,
        topCard,
        bottomFaceUp: false,
      });
    }
    const hand = deck.slice(cursor, cursor + HAND_CARDS_PER_PLAYER);
    cursor += HAND_CARDS_PER_PLAYER;
    return {
      ...player,
      hand: sortHand(hand),
      tablePiles,
    };
  });

  const leaderIndex = (dealerIndex + 1) % playerCount;

  return {
    players: dealtPlayers,
    phase: 'playing',
    scoreThreshold,
    dealerIndex,
    currentPlayerIndex: leaderIndex,
    roundNumber,
    centerPile: [],
    discardCount: 0,
    lastPlayRank: null,
    extraTurnPending: false,
    roundOutPlayerId: null,
    lastRoundScores: {},
    roundSummary: '',
    gameOver: false,
    winners: [],
    actionAnnouncement: null,
  };
}

function endRound(state: TensState, outPlayerId: string): TensState {
  const roundScores: Record<string, number> = {};
  const updatedPlayers = state.players.map((player) => {
    if (player.id === outPlayerId) {
      roundScores[player.id] = 0;
      return player;
    }
    const penalty = allCardsHeld(player).reduce((sum, card) => sum + cardPenaltyPoints(card), 0);
    roundScores[player.id] = penalty;
    return { ...player, totalScore: player.totalScore + penalty };
  });

  const summary = buildRoundSummary(updatedPlayers, roundScores, outPlayerId);

  if (hasReachedScoreThreshold(updatedPlayers, state.scoreThreshold)) {
    return {
      ...state,
      players: updatedPlayers,
      phase: 'round-end',
      roundOutPlayerId: outPlayerId,
      lastRoundScores: roundScores,
      roundSummary: summary,
      gameOver: true,
      winners: getLowestScoreWinners(updatedPlayers),
      extraTurnPending: false,
      actionAnnouncement: null,
    };
  }

  return {
    ...state,
    players: updatedPlayers,
    phase: 'round-end',
    roundOutPlayerId: outPlayerId,
    lastRoundScores: roundScores,
    roundSummary: summary,
    gameOver: false,
    extraTurnPending: false,
    actionAnnouncement: null,
  };
}

function applyPlayResult(
  state: TensState,
  playerIndex: number,
  plays: SelectedCardPlay[],
  options: { clearWithWild?: boolean },
): TensState {
  const playerId = state.players[playerIndex]?.id;
  if (!playerId) return state;

  let players = [...state.players];
  let current = state.players[playerIndex];

  for (const play of plays) {
    current = removeCardFromPlayer(current, play);
  }
  players[playerIndex] = current;

  const playedRank = plays[0]?.card.rank;
  if (!playedRank) return state;

  const centerAfterPlay = [...state.centerPile, ...plays.map(p => p.card)];
  let centerPile = centerAfterPlay;
  let lastPlayRank = state.lastPlayRank;
  let discardCount = state.discardCount;
  let extraTurnPending = false;
  let outcome: TensPlayOutcome = 'normal';

  let discardCountBeforeClear: number | undefined;

  const wildClear = options.clearWithWild === true && playedRank === 10;

  if (wildClear) {
    discardCountBeforeClear = discardCount;
    discardCount += centerPile.length;
    centerPile = [];
    lastPlayRank = null;
    extraTurnPending = true;
    outcome = 'wild-clear';
  } else if (wouldPickup(playedRank, lastPlayRank)) {
    centerPile = [];
    lastPlayRank = null;
    players[playerIndex] = {
      ...players[playerIndex],
      hand: sortHand([...players[playerIndex].hand, ...centerAfterPlay]),
    };
    extraTurnPending = true;
    outcome = 'pickup';
  } else {
    lastPlayRank = playedRank;
    if (isSetClear(centerPile)) {
      discardCountBeforeClear = discardCount;
      discardCount += centerPile.length;
      centerPile = [];
      lastPlayRank = null;
      extraTurnPending = true;
      outcome = 'set-clear';
    }
  }

  const actionAnnouncement: TensActionAnnouncement = {
    playerId,
    plays,
    outcome,
    centerAfterPlay,
    ...(discardCountBeforeClear !== undefined ? { discardCountBeforeClear } : {}),
  };

  if (playerHasNoCards(players[playerIndex])) {
    return endRound(
      {
        ...state,
        players,
        centerPile,
        discardCount,
        lastPlayRank,
        extraTurnPending: false,
        phase: 'playing',
        actionAnnouncement: null,
      },
      playerId,
    );
  }

  const nextPlayerIndex = extraTurnPending
    ? playerIndex
    : advanceToNextPlayer({ ...state, currentPlayerIndex: playerIndex });

  return {
    ...state,
    players,
    centerPile,
    discardCount,
    lastPlayRank,
    extraTurnPending: false,
    phase: 'announcement',
    currentPlayerIndex: nextPlayerIndex,
    actionAnnouncement,
  };
}

function handlePlayCards(state: TensState, playerId: string, action: Extract<TensAction, { type: 'play-cards' }>): TensState {
  if (state.phase !== 'playing') return state;

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || state.players[playerIndex].id !== state.players[state.currentPlayerIndex]?.id) {
    return state;
  }

  if (!validatePlays(state, playerIndex, action.plays)) {
    return state;
  }

  if (action.plays.every(p => p.card.rank === 10)) {
    return applyPlayResult(state, playerIndex, action.plays, { clearWithWild: true });
  }

  return applyPlayResult(state, playerIndex, action.plays, {});
}

export function createTensState(players: Player[], options?: GameStartOptions): TensState {
  const scoreThreshold = resolveScoreThreshold(options);
  const tensPlayers = toTensPlayers(players);
  return startRound(tensPlayers, 0, 1, scoreThreshold);
}

export function processTensAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as TensState;
  const a = action as TensAction;

  if (a.type === 'play-cards') {
    if (!playerId) return s;
    return handlePlayCards(s, playerId, a);
  }

  if (a.type === 'finish-action-announcement') {
    if (playerId) return s;
    if (s.phase !== 'announcement') return s;
    return {
      ...s,
      phase: 'playing',
      actionAnnouncement: null,
    };
  }

  if (a.type === 'start-next-round') {
    if (playerId) return s;
    if (s.phase !== 'round-end' || s.gameOver) return s;
    const nextDealer = (s.dealerIndex + 1) % s.players.length;
    return startRound(s.players, nextDealer, s.roundNumber + 1, s.scoreThreshold);
  }

  if (a.type === 'show-final-results') {
    if (playerId) return s;
    if (s.phase !== 'round-end' || !s.gameOver) return s;
    return { ...s, phase: 'game-over' };
  }

  return s;
}

export function isTensOver(state: unknown): boolean {
  return (state as TensState).phase === 'game-over';
}

export function getTensWinners(state: unknown): string[] {
  return (state as TensState).winners;
}

type LegalPlayGroup = { rank: Rank; plays: PlayableCard[] };

function orderPlaysBySource(plays: PlayableCard[]): PlayableCard[] {
  return [
    ...plays.filter(p => p.source === 'pile-top'),
    ...plays.filter(p => p.source === 'pile-bottom'),
    ...plays.filter(p => p.source === 'hand'),
  ];
}

function selectRankToPlay(
  groups: LegalPlayGroup[],
  lastPlayRank: Rank | null,
): LegalPlayGroup | null {
  const nonTen = groups.filter(g => g.rank !== 10);

  if (lastPlayRank !== null) {
    const legal = nonTen
      .filter(g => canPlayRank(g.rank, lastPlayRank))
      .sort((a, b) => playRankValue(b.rank) - playRankValue(a.rank));
    return legal[0] ?? null;
  }

  const withoutAce = nonTen.filter(g => g.rank !== 14);
  const candidates = (withoutAce.length > 0 ? withoutAce : nonTen)
    .sort((a, b) => playRankValue(b.rank) - playRankValue(a.rank));
  return candidates[0] ?? null;
}

function selectCardsForRank(group: LegalPlayGroup, centerPile: Card[]): SelectedCardPlay[] {
  const ordered = orderPlaysBySource(group.plays);
  const sameRankInCenter = centerPile.filter(c => c.rank === group.rank).length;
  const neededForClear = Math.max(1, 4 - sameRankInCenter);
  const count = sameRankInCenter + ordered.length >= 4
    ? Math.min(ordered.length, neededForClear)
    : ordered.length;

  return ordered.slice(0, count).map(p => ({
    card: p.card,
    source: p.source,
    pileIndex: p.pileIndex,
  }));
}

function chooseBotPlays(state: TensState, playerIndex: number): SelectedCardPlay[] | null {
  const player = state.players[playerIndex];
  if (!player || state.phase !== 'playing') return null;

  const groups = listLegalPlayGroups(state, playerIndex);
  if (groups.length === 0) return null;

  const centerSize = state.centerPile.length;

  const wildGroup = groups.find(g => g.rank === 10);
  if (wildGroup && centerSize >= 8) {
    const ten = wildGroup.plays[0];
    if (ten) {
      return [{ card: ten.card, source: ten.source, pileIndex: ten.pileIndex }];
    }
  }

  for (const group of groups) {
    if (group.rank === 10) continue;
    const playable = group.plays;
    const rank = group.rank;
    const sameRankInCenter = state.centerPile.filter(c => c.rank === rank).length;
    const toPlay = Math.min(playable.length, Math.max(1, 4 - sameRankInCenter));
    if (sameRankInCenter + toPlay >= 4 && playRankValue(rank) <= (state.lastPlayRank ? playRankValue(state.lastPlayRank) : 99)) {
      return playable.slice(0, toPlay).map(p => ({
        card: p.card,
        source: p.source,
        pileIndex: p.pileIndex,
      }));
    }
  }

  const chosenGroup = selectRankToPlay(groups, state.lastPlayRank);
  if (chosenGroup) {
    return selectCardsForRank(chosenGroup, state.centerPile);
  }

  const pickupGroups = groups
    .filter(g => state.lastPlayRank !== null && playRankValue(g.rank) > playRankValue(state.lastPlayRank))
    .sort((a, b) => playRankValue(a.rank) - playRankValue(b.rank));

  if (pickupGroups.length > 0 && centerSize <= 6) {
    const pick = pickupGroups.find(g => g.rank !== 10) ?? pickupGroups[0];
    const entry = pick.plays[0];
    if (entry) {
      return [{ card: entry.card, source: entry.source, pileIndex: entry.pileIndex }];
    }
  }

  if (wildGroup?.plays[0] && centerSize > 0) {
    const ten = wildGroup.plays[0];
    return [{ card: ten.card, source: ten.source, pileIndex: ten.pileIndex }];
  }

  if (wildGroup?.plays[0]) {
    return [{
      card: wildGroup.plays[0].card,
      source: wildGroup.plays[0].source,
      pileIndex: wildGroup.plays[0].pileIndex,
    }];
  }

  const fallback = groups[0]?.plays[0];
  if (!fallback) return null;
  return [{ card: fallback.card, source: fallback.source, pileIndex: fallback.pileIndex }];
}

export function runTensBotTurn(state: unknown): unknown {
  const s = state as TensState;
  if (s.phase === 'round-end' || s.phase === 'game-over') return s;

  const playerIndex = s.currentPlayerIndex;
  const player = s.players[playerIndex];
  if (!player?.isBot) return s;
  if (s.phase !== 'playing') return s;

  const plays = chooseBotPlays(s, playerIndex);
  if (!plays || plays.length === 0) return s;

  return processTensAction(s, {
    type: 'play-cards',
    plays,
  }, player.id);
}

export { deckCountForPlayers, countCardsHeld, CARDS_PER_PLAYER };
