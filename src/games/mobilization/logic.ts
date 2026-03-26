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
const MOBILIZATION_SUIT_ORDER: Record<Suit, number> = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };

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
  return [...hand].sort((a, b) => {
    if (MOBILIZATION_SUIT_ORDER[a.suit] !== MOBILIZATION_SUIT_ORDER[b.suit]) {
      return MOBILIZATION_SUIT_ORDER[a.suit] - MOBILIZATION_SUIT_ORDER[b.suit];
    }
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

/** Same column + hand update as `solitaire-play`; shared by action handler and bot simulation. */
function applySolitairePlay(
  columns: SolitaireColumn[],
  hand: Card[],
  card: Card,
  columnIndex: number,
): { columns: SolitaireColumn[]; hand: Card[] } | null {
  if (!hand.some(c => cardEquals(c, card))) return null;
  if (!isValidSolitairePlay(columns, card, columnIndex)) return null;

  const col = columns[columnIndex];
  let newCol: SolitaireColumn;

  if (col.seven === null && card.rank === 7) {
    newCol = {
      seven: card,
      topCard: null,
      bottomCard: null,
      topNext: 6,
      bottomNext: 8,
    };
  }
  else if (col.topNext !== null && col.seven && card.rank === col.topNext && card.suit === col.seven.suit) {
    newCol = applySolitaireTopPlay(col, card);
  }
  else if (col.bottomNext !== null && col.seven && card.rank === col.bottomNext && card.suit === col.seven.suit) {
    newCol = applySolitaireBottomPlay(col, card);
  }
  else {
    return null;
  }

  const newColumns = [...columns];
  newColumns[columnIndex] = newCol;
  const newHand = hand.filter(c => !cardEquals(c, card));
  return { columns: newColumns, hand: newHand };
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

      const applied = applySolitairePlay(s.solitaireColumns, s.players[playerIndex].hand, a.card, a.columnIndex);
      if (!applied) return state;

      const newPlayers = [...s.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hand: applied.hand };
      const newColumns = applied.columns;

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

function compareCardLowFirst(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return MOBILIZATION_SUIT_ORDER[a.suit] - MOBILIZATION_SUIT_ORDER[b.suit];
}

function compareCardHighFirst(a: Card, b: Card): number {
  if (a.rank !== b.rank) return b.rank - a.rank;
  return MOBILIZATION_SUIT_ORDER[b.suit] - MOBILIZATION_SUIT_ORDER[a.suit];
}

/** Penalty if we win this trick (minimize in rounds 0–3; round 5 uses negative penalty). */
function trickPenaltyIfWeWin(
  state: MobilizationState,
  playerIndex: number,
  trick: { playerId: string; card: Card }[],
): number {
  const r = state.roundIndex;
  const clubsInTrick = trick.filter(t => t.card.suit === 'clubs').length;
  const queensInTrick = trick.filter(t => t.card.rank === 12).length;
  const hasKingClubs = trick.some(t => t.card.suit === 'clubs' && t.card.rank === 13);
  const isLastTrick = state.trickNumber >= state.cardsPerTrickRound;
  const p = state.players[playerIndex]!;

  switch (r) {
    case 0:
      return 2;
    case 1:
      return 2 * clubsInTrick;
    case 2:
      return 5 * queensInTrick;
    case 3: {
      let cost = 0;
      if (hasKingClubs && !p.hadKingClubs) cost += 5;
      if (isLastTrick) cost += 5;
      return cost;
    }
    case 5:
      return -2;
    default:
      return 0;
  }
}

function chooseTrickCard(state: MobilizationState, playerIndex: number): Card | null {
  const hand = state.players[playerIndex].hand;
  const valid = hand.filter(c => isValidMobilizationTrickPlay(state, playerIndex, c));
  if (valid.length === 0) return null;

  const playerId = state.players[playerIndex].id;
  const completesTrick = state.currentTrick.length + 1 === state.players.length;

  if (!completesTrick) {
    const pickLow = state.roundIndex !== 5;
    let best = valid[0]!;
    for (let i = 1; i < valid.length; i++) {
      const c = valid[i]!;
      const cmp = pickLow ? compareCardLowFirst(c, best) : compareCardHighFirst(c, best);
      if (cmp < 0) best = c;
    }
    return best;
  }

  let best = valid[0]!;
  let bestPenalty = (() => {
    const full = [...state.currentTrick, { playerId, card: best }];
    const w = getMobilizationTrickWinnerId(full);
    return w === playerId ? trickPenaltyIfWeWin(state, playerIndex, full) : 0;
  })();

  for (let i = 1; i < valid.length; i++) {
    const card = valid[i]!;
    const fullTrick = [...state.currentTrick, { playerId, card }];
    const winnerId = getMobilizationTrickWinnerId(fullTrick);
    const penalty = winnerId === playerId ? trickPenaltyIfWeWin(state, playerIndex, fullTrick) : 0;
    if (penalty < bestPenalty || (penalty === bestPenalty && compareCardLowFirst(card, best) < 0)) {
      best = card;
      bestPenalty = penalty;
    }
  }

  return best;
}

function chooseSolitaireMove(state: MobilizationState, playerIndex: number): MobilizationAction | null {
  const hand = state.players[playerIndex].hand;
  const legal = getLegalSolitairePlays(state.solitaireColumns, hand);
  if (legal.length === 0) return { type: 'solitaire-pass' };

  type Legal = (typeof legal)[number];
  let best: Legal | null = null;
  let bestMob = -1;
  let bestSuitRemain = -1;

  for (const cand of legal) {
    const applied = applySolitairePlay(state.solitaireColumns, hand, cand.card, cand.columnIndex);
    if (!applied) continue;
    const mob = getLegalSolitairePlays(applied.columns, applied.hand).length;
    const suitRemain = applied.hand.filter(c => c.suit === cand.card.suit).length;
    if (best === null) {
      best = cand;
      bestMob = mob;
      bestSuitRemain = suitRemain;
      continue;
    }
    const better =
      mob > bestMob
      || (mob === bestMob && suitRemain > bestSuitRemain)
      || (
        mob === bestMob
        && suitRemain === bestSuitRemain
        && (
          cand.columnIndex < best.columnIndex
          || (cand.columnIndex === best.columnIndex && compareCardLowFirst(cand.card, best.card) < 0)
        )
      );
    if (better) {
      best = cand;
      bestMob = mob;
      bestSuitRemain = suitRemain;
    }
  }

  if (!best) return { type: 'solitaire-pass' };
  return { type: 'solitaire-play', card: best.card, columnIndex: best.columnIndex };
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
