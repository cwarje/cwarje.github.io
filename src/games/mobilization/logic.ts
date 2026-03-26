import type { Player } from '../../networking/types';
import type { Card, MobilizationAction, MobilizationPlayer, MobilizationState, Rank, SolitaireColumn, Suit } from './types';
import {
  applySolitaireBottomPlay,
  applySolitaireTopPlay,
  cardEquals,
  getLegalSolitairePlays,
  getMobilizationTrickWinnerId,
  isValidMobilizationTrickPlay,
  isValidSolitairePlay,
  removalSortKey,
  trickRoundHasNoScoringCardsRemaining,
} from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function createFullDeck(): Card[] {
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

function trimDeckForRound(roundIndex: number, playerCount: number): { removed: Card[]; deck: Card[] } {
  const full = createFullDeck();
  const removeCount = 52 % playerCount;
  if (removeCount === 0) {
    return { removed: [], deck: shuffle(full) };
  }
  const sorted = [...full].sort(
    (a, b) => removalSortKey(roundIndex, a) - removalSortKey(roundIndex, b),
  );
  const removed = sorted.slice(0, removeCount);
  const remaining = sorted.slice(removeCount);
  return { removed, deck: shuffle(remaining) };
}

function emptySolitaireColumns(): SolitaireColumn[] {
  return Array.from({ length: 4 }, () => ({
    seven: null,
    topCard: null,
    bottomCard: null,
    topNext: null,
    bottomNext: null,
  }));
}

function resetRoundStats(player: MobilizationPlayer): MobilizationPlayer {
  return {
    ...player,
    hand: [],
    tricksThisRound: 0,
    clubsThisRound: 0,
    queensThisRound: 0,
    hadKingClubs: false,
    tookLastTrick: false,
    roundScore: 0,
  };
}

function dealTrickRound(
  players: MobilizationPlayer[],
  roundIndex: number,
  dealerIndex: number,
): MobilizationState {
  const playerCount = players.length;
  const { removed, deck } = trimDeckForRound(roundIndex, playerCount);
  const perPlayer = deck.length / playerCount;

  const dealt = players.map((p, i) => {
    const hand = deck.slice(i * perPlayer, (i + 1) * perPlayer);
    return {
      ...resetRoundStats(p),
      hand: sortHand(hand),
    };
  });

  const leaderIndex = (dealerIndex + 1) % playerCount;

  const base: MobilizationState = {
    players: dealt,
    phase: 'playing',
    roundIndex,
    dealerIndex,
    leaderIndex,
    currentPlayerIndex: leaderIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 1,
    cardsPerTrickRound: perPlayer,
    removedCards: removed,
    gameOver: false,
    pigHolderId: null,
    solitaireColumns: emptySolitaireColumns(),
  };

  if (trickRoundHasNoScoringCardsRemaining(base)) {
    return {
      ...base,
      phase: 'round-depleted',
      trickRoundDepletedKind: roundIndex === 1 ? 'clubs' : 'queens',
    };
  }

  return base;
}

function dealSolitaireRound(
  players: MobilizationPlayer[],
  roundIndex: number,
  dealerIndex: number,
): MobilizationState {
  const playerCount = players.length;
  const { removed, deck } = trimDeckForRound(roundIndex, playerCount);
  const perPlayer = deck.length / playerCount;

  const dealt = players.map((p, i) => {
    const hand = deck.slice(i * perPlayer, (i + 1) * perPlayer);
    return {
      ...resetRoundStats(p),
      hand: sortHand(hand),
    };
  });

  const leaderIndex = (dealerIndex + 1) % playerCount;

  return {
    players: dealt,
    phase: 'solitaire',
    roundIndex,
    dealerIndex,
    leaderIndex,
    currentPlayerIndex: leaderIndex,
    currentTrick: [],
    trickWinner: null,
    trickNumber: 1,
    cardsPerTrickRound: perPlayer,
    removedCards: removed,
    gameOver: false,
    pigHolderId: null,
    solitaireColumns: emptySolitaireColumns(),
  };
}

export function createMobilizationState(players: Player[]): MobilizationState {
  const gamePlayers = players.slice(0, 6);
  const initial: MobilizationPlayer[] = gamePlayers.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    hand: [],
    tricksThisRound: 0,
    clubsThisRound: 0,
    queensThisRound: 0,
    hadKingClubs: false,
    tookLastTrick: false,
    roundScore: 0,
    totalScore: 0,
  }));
  return dealTrickRound(initial, 0, 0);
}

function scoreTrickRound(state: MobilizationState): MobilizationPlayer[] {
  const r = state.roundIndex;
  return state.players.map((p) => {
    let roundScore = 0;
    if (r === 0) roundScore = -2 * p.tricksThisRound;
    else if (r === 1) roundScore = -2 * p.clubsThisRound;
    else if (r === 2) roundScore = -5 * p.queensThisRound;
    else if (r === 3) {
      roundScore = (p.hadKingClubs ? -5 : 0) + (p.tookLastTrick ? -5 : 0);
    }
    else if (r === 5) roundScore = 2 * p.tricksThisRound;

    return {
      ...p,
      roundScore,
      totalScore: p.totalScore + roundScore,
    };
  });
}

function endTrickRound(state: MobilizationState): MobilizationState {
  const scoredPlayers = scoreTrickRound(state);
  const isLastRound = state.roundIndex >= 5;

  if (isLastRound) {
    return {
      ...state,
      players: scoredPlayers,
      phase: 'round-end',
      gameOver: true,
      trickWinner: null,
      currentTrick: [],
      trickRoundDepletedKind: undefined,
    };
  }

  return {
    ...state,
    players: scoredPlayers,
    phase: 'round-end',
    gameOver: false,
    trickWinner: null,
    currentTrick: [],
    trickRoundDepletedKind: undefined,
  };
}

function endSolitaireRound(state: MobilizationState, winnerId: string): MobilizationState {
  const pigId = state.pigHolderId;
  const players = state.players.map((p) => {
    let delta = -2 * p.hand.length;
    if (p.id === winnerId) delta += 5;
    if (pigId && p.id === pigId) delta -= 5;
    return {
      ...p,
      roundScore: delta,
      totalScore: p.totalScore + delta,
      hand: [],
    };
  });

  return {
    ...state,
    players,
    phase: 'round-end',
    gameOver: false,
    pigHolderId: null,
    trickWinner: null,
    currentTrick: [],
  };
}

function startNextRoundFrom(state: MobilizationState): MobilizationState {
  const nextDealer = (state.dealerIndex + 1) % state.players.length;
  const nextRound = state.roundIndex + 1;
  const basePlayers = state.players.map(p => ({
    ...p,
    roundScore: 0,
  }));

  if (nextRound === 4) {
    return dealSolitaireRound(basePlayers, nextRound, nextDealer);
  }
  return dealTrickRound(basePlayers, nextRound, nextDealer);
}

function devJumpToRound(state: MobilizationState, target: number): MobilizationState {
  if (!Number.isInteger(target) || target < 0 || target > 5) return state;
  const playerCount = state.players.length;
  if (playerCount === 0) return state;

  const basePlayers = state.players.map(p => ({
    ...resetRoundStats(p),
    totalScore: 0,
  }));
  const dealerIndex = target % playerCount;
  if (target === 4) return dealSolitaireRound(basePlayers, target, dealerIndex);
  return dealTrickRound(basePlayers, target, dealerIndex);
}

export function processMobilizationAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as MobilizationState;
  const a = action as MobilizationAction;

  if (import.meta.env.DEV && a.type === 'dev-jump-round') {
    return devJumpToRound(s, a.roundIndex);
  }

  if (s.gameOver) return state;

  switch (a.type) {
    case 'start-next-round': {
      if (s.phase !== 'round-end' || s.gameOver) return state;
      return startNextRoundFrom(s);
    }

    case 'play-card': {
      if (s.phase !== 'playing' || s.trickWinner) return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!isValidMobilizationTrickPlay(s, playerIndex, a.card)) return state;

      const newHand = s.players[playerIndex].hand.filter(c => !cardEquals(c, a.card));
      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hand: newHand };
      const newTrick = [...s.currentTrick, { playerId, card: a.card }];

      if (newTrick.length === s.players.length) {
        const winnerId = getMobilizationTrickWinnerId(newTrick);
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

      const r = s.roundIndex;
      const trick = s.currentTrick;
      const clubsInTrick = trick.filter(t => t.card.suit === 'clubs').length;
      const queensInTrick = trick.filter(t => t.card.rank === 12).length;
      const hasKingClubs = trick.some(t => t.card.suit === 'clubs' && t.card.rank === 13);
      const isLastTrick = s.trickNumber >= s.cardsPerTrickRound;

      const updatedPlayers = [...s.players];
      const wp = updatedPlayers[winnerIndex];
      updatedPlayers[winnerIndex] = {
        ...wp,
        tricksThisRound: wp.tricksThisRound + 1,
        clubsThisRound: r === 1 ? wp.clubsThisRound + clubsInTrick : wp.clubsThisRound,
        queensThisRound: r === 2 ? wp.queensThisRound + queensInTrick : wp.queensThisRound,
        hadKingClubs: r === 3 ? wp.hadKingClubs || hasKingClubs : wp.hadKingClubs,
        tookLastTrick: r === 3 ? (isLastTrick ? true : wp.tookLastTrick) : wp.tookLastTrick,
      };

      if (isLastTrick) {
        return endTrickRound({
          ...s,
          players: updatedPlayers,
          trickWinner: null,
          currentTrick: [],
        });
      }

      const continuing: MobilizationState = {
        ...s,
        players: updatedPlayers,
        currentTrick: [],
        trickWinner: null,
        trickNumber: s.trickNumber + 1,
        leaderIndex: winnerIndex,
        currentPlayerIndex: winnerIndex,
      };

      if (trickRoundHasNoScoringCardsRemaining(continuing)) {
        return {
          ...continuing,
          phase: 'round-depleted',
          trickRoundDepletedKind: r === 1 ? 'clubs' : 'queens',
        };
      }

      return continuing;
    }

    case 'complete-trick-round-depletion': {
      if (s.phase !== 'round-depleted') return state;
      return endTrickRound(s);
    }

    case 'solitaire-pass': {
      if (s.phase !== 'solitaire') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      const hand = s.players[playerIndex].hand;
      if (getLegalSolitairePlays(s.solitaireColumns, hand).length > 0) return state;

      return {
        ...s,
        pigHolderId: playerId,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
      };
    }

    case 'solitaire-play': {
      if (s.phase !== 'solitaire') return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
      if (!s.players[playerIndex].hand.some(c => cardEquals(c, a.card))) return state;
      if (!isValidSolitairePlay(s.solitaireColumns, a.card, a.columnIndex)) return state;

      const col = s.solitaireColumns[a.columnIndex];
      let newCol: SolitaireColumn;

      if (col.seven === null && a.card.rank === 7) {
        newCol = {
          seven: a.card,
          topCard: null,
          bottomCard: null,
          topNext: 6,
          bottomNext: 8,
        };
      }
      else if (col.topNext !== null && col.seven && a.card.rank === col.topNext && a.card.suit === col.seven.suit) {
        newCol = applySolitaireTopPlay(col, a.card);
      }
      else if (col.bottomNext !== null && col.seven && a.card.rank === col.bottomNext && a.card.suit === col.seven.suit) {
        newCol = applySolitaireBottomPlay(col, a.card);
      }
      else {
        return state;
      }

      const newColumns = [...s.solitaireColumns];
      newColumns[a.columnIndex] = newCol;

      const newHand = s.players[playerIndex].hand.filter(c => !cardEquals(c, a.card));
      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hand: newHand };

      const winnerIdx = newPlayers.findIndex(p => p.hand.length === 0);
      if (winnerIdx !== -1) {
        return endSolitaireRound(
          {
            ...s,
            players: newPlayers,
            solitaireColumns: newColumns,
          },
          newPlayers[winnerIdx].id,
        );
      }

      return {
        ...s,
        players: newPlayers,
        solitaireColumns: newColumns,
        currentPlayerIndex: (s.currentPlayerIndex + 1) % s.players.length,
      };
    }

    default:
      return state;
  }
}

export function getMobilizationWinners(state: unknown): string[] {
  const s = state as MobilizationState;
  const maxScore = Math.max(...s.players.map(p => p.totalScore));
  return s.players.filter(p => p.totalScore === maxScore).map(p => p.id);
}

export function isMobilizationOver(state: unknown): boolean {
  return (state as MobilizationState).gameOver;
}

function chooseTrickCard(state: MobilizationState, playerIndex: number): Card | null {
  const hand = state.players[playerIndex].hand;
  const valid = hand.filter(c => isValidMobilizationTrickPlay(state, playerIndex, c));
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)] ?? null;
}

function chooseSolitaireMove(state: MobilizationState, playerIndex: number): MobilizationAction | null {
  const hand = state.players[playerIndex].hand;
  const legal = getLegalSolitairePlays(state.solitaireColumns, hand);
  if (legal.length > 0) {
    const pick = legal[Math.floor(Math.random() * legal.length)]!;
    return { type: 'solitaire-play', card: pick.card, columnIndex: pick.columnIndex };
  }
  return { type: 'solitaire-pass' };
}

export function runMobilizationBotTurn(state: unknown): unknown {
  const s = state as MobilizationState;
  if (s.gameOver || s.phase === 'round-end' || s.phase === 'round-depleted') return state;

  const current = s.players[s.currentPlayerIndex];
  if (!current?.isBot) return state;

  if (s.phase === 'solitaire') {
    const move = chooseSolitaireMove(s, s.currentPlayerIndex);
    if (!move) return state;
    return processMobilizationAction(s, move, current.id);
  }

  if (s.phase === 'playing' && !s.trickWinner) {
    const card = chooseTrickCard(s, s.currentPlayerIndex);
    if (!card) return state;
    return processMobilizationAction(s, { type: 'play-card', card }, current.id);
  }

  return state;
}
