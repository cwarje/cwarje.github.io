import type { Player } from '../../networking/types';
import type { Card, GolfAction, GolfPlayer, GolfState, Rank, Suit, TableSlot } from './types';
import { TABLE_SLOT_COUNT, TOTAL_HOLES } from './types';
import {
  allTableFaceUp,
  canDiscardDrawn,
  canDrawFromStock,
  canSwapWithSlot,
  canTakeDiscard,
  cardEquals,
  estimatedSlotValue,
  scorePlayerTable,
  slotPointValue,
} from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

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

function deckCountForPlayers(playerCount: number): number {
  return playerCount >= 5 ? 2 : 1;
}

function buildDeck(playerCount: number): Card[] {
  const decks: Card[] = [];
  for (let i = 0; i < deckCountForPlayers(playerCount); i++) {
    decks.push(...createDeck());
  }
  return shuffle(decks);
}

function drawFromStock(stock: Card[], discard: Card[]): { stock: Card[]; discard: Card[]; card: Card | null } {
  let nextStock = [...stock];
  let nextDiscard = [...discard];
  if (nextStock.length === 0) {
    if (nextDiscard.length <= 1) return { stock: nextStock, discard: nextDiscard, card: null };
    const top = nextDiscard[nextDiscard.length - 1]!;
    const rest = nextDiscard.slice(0, -1);
    nextStock = shuffle(rest);
    nextDiscard = [top];
  }
  const card = nextStock.pop() ?? null;
  return { stock: nextStock, discard: nextDiscard, card };
}

function buildInitialTable(cards: Card[]): TableSlot[] {
  const table = cards.map(card => ({ card, faceUp: false }));
  for (let i = 3; i < TABLE_SLOT_COUNT; i++) {
    table[i] = { ...table[i]!, faceUp: true };
  }
  return table;
}

function getLowestScoreWinners(players: GolfPlayer[]): string[] {
  const min = Math.min(...players.map(p => p.totalScore));
  return players.filter(p => p.totalScore === min).map(p => p.id);
}

function formatHoleSummary(holeScores: Record<string, number>, players: GolfPlayer[]): string {
  const parts = players.map(p => `${p.name} ${holeScores[p.id] ?? 0}`);
  return parts.join(' · ');
}

function startHole(players: GolfPlayer[], holeNumber: number): GolfState {
  const deck = buildDeck(players.length);
  let offset = 0;
  const dealtPlayers = players.map(player => {
    const tableCards = deck.slice(offset, offset + TABLE_SLOT_COUNT);
    offset += TABLE_SLOT_COUNT;
    return {
      ...player,
      table: buildInitialTable(tableCards),
    };
  });

  let stock = deck.slice(offset);
  let discard: Card[] = [];
  const starter = stock.pop();
  if (starter) discard = [starter];

  return {
    players: dealtPlayers,
    stock,
    discard,
    currentPlayerIndex: 0,
    holeNumber,
    phase: 'playing',
    pendingDraw: null,
    pendingDrawSource: null,
    endingRound: false,
    finalTurnsLeft: 0,
    holeScores: {},
    holeSummary: '',
    gameOver: false,
    winners: [],
  };
}

function finishGame(players: GolfPlayer[]): GolfState {
  return {
    players,
    stock: [],
    discard: [],
    currentPlayerIndex: 0,
    holeNumber: TOTAL_HOLES,
    phase: 'game-over',
    pendingDraw: null,
    pendingDrawSource: null,
    endingRound: false,
    finalTurnsLeft: 0,
    holeScores: {},
    holeSummary: '',
    gameOver: true,
    winners: getLowestScoreWinners(players),
  };
}

function endHole(state: GolfState): GolfState {
  const holeScores: Record<string, number> = {};
  const updatedPlayers = state.players.map(player => {
    const holeScore = scorePlayerTable(player);
    holeScores[player.id] = holeScore;
    return { ...player, totalScore: player.totalScore + holeScore };
  });

  const holeSummary = formatHoleSummary(holeScores, updatedPlayers);

  if (state.holeNumber >= TOTAL_HOLES) {
    return {
      ...finishGame(updatedPlayers),
      holeNumber: state.holeNumber,
      holeScores,
      holeSummary,
    };
  }

  return {
    ...state,
    players: updatedPlayers,
    phase: 'hole-end',
    pendingDraw: null,
    pendingDrawSource: null,
    endingRound: false,
    finalTurnsLeft: 0,
    holeScores,
    holeSummary,
  };
}

function advanceTurn(state: GolfState, players: GolfPlayer[]): GolfState {
  const playerCount = players.length;
  let endingRound = state.endingRound;
  let finalTurnsLeft = state.finalTurnsLeft;

  const currentPlayer = players[state.currentPlayerIndex];
  if (currentPlayer && allTableFaceUp(currentPlayer) && !endingRound) {
    endingRound = true;
    finalTurnsLeft = playerCount - 1;
  }

  if (endingRound) {
    if (finalTurnsLeft <= 0) {
      return endHole({ ...state, players, endingRound, finalTurnsLeft: 0 });
    }
    const nextIndex = (state.currentPlayerIndex + 1) % playerCount;
    return {
      ...state,
      players,
      currentPlayerIndex: nextIndex,
      endingRound,
      finalTurnsLeft: finalTurnsLeft - 1,
    };
  }

  return {
    ...state,
    players,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % playerCount,
    endingRound,
    finalTurnsLeft,
  };
}

function applySwap(
  state: GolfState,
  playerIndex: number,
  slotIndex: number,
): GolfState {
  const player = state.players[playerIndex];
  if (!player || !state.pendingDraw) return state;

  const drawn = state.pendingDraw;
  const replaced = player.table[slotIndex]!;
  const newTable = [...player.table];
  newTable[slotIndex] = { card: drawn, faceUp: true };

  const newPlayers = [...state.players];
  newPlayers[playerIndex] = { ...player, table: newTable };

  return advanceTurn(
    {
      ...state,
      players: newPlayers,
      discard: [...state.discard, replaced.card],
      pendingDraw: null,
      pendingDrawSource: null,
    },
    newPlayers,
  );
}

export function createGolfState(players: Player[]): GolfState {
  const gamePlayers: GolfPlayer[] = players.slice(0, 6).map(player => ({
    id: player.id,
    name: player.name,
    color: player.color,
    isBot: player.isBot,
    table: [],
    totalScore: 0,
  }));

  return startHole(gamePlayers, 1);
}

export function processGolfAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as GolfState;
  const a = action as GolfAction;
  if (s.gameOver) return state;

  switch (a.type) {
    case 'draw-from-stock': {
      if (!canDrawFromStock(s, playerId)) return state;
      const drawn = drawFromStock(s.stock, s.discard);
      if (!drawn.card) return state;
      return {
        ...s,
        stock: drawn.stock,
        discard: drawn.discard,
        pendingDraw: drawn.card,
        pendingDrawSource: 'stock',
      };
    }

    case 'take-discard': {
      if (!canTakeDiscard(s, playerId)) return state;
      const nextDiscard = [...s.discard];
      const card = nextDiscard.pop();
      if (!card) return state;
      return {
        ...s,
        discard: nextDiscard,
        pendingDraw: card,
        pendingDrawSource: 'discard',
      };
    }

    case 'swap-with-slot': {
      if (!canSwapWithSlot(s, playerId, a.slotIndex)) return state;
      const playerIndex = s.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return state;
      return applySwap(s, playerIndex, a.slotIndex);
    }

    case 'discard-drawn': {
      if (!canDiscardDrawn(s, playerId)) return state;
      const drawn = s.pendingDraw;
      if (!drawn) return state;
      return advanceTurn(
        {
          ...s,
          discard: [...s.discard, drawn],
          pendingDraw: null,
          pendingDrawSource: null,
        },
        s.players,
      );
    }

    case 'start-next-hole': {
      if (s.phase !== 'hole-end' || s.gameOver) return state;
      if (s.holeNumber >= TOTAL_HOLES) return finishGame(s.players);
      return startHole(s.players, s.holeNumber + 1);
    }
  }

  return state;
}

export function isGolfOver(state: unknown): boolean {
  const s = state as GolfState;
  return s.gameOver;
}

export function getGolfWinners(state: unknown): string[] {
  const s = state as GolfState;
  return s.winners;
}

function bestSwapSlot(player: GolfPlayer, drawn: Card): number {
  let bestIndex = 0;
  let bestImprovement = -Infinity;
  for (let i = 0; i < TABLE_SLOT_COUNT; i++) {
    const currentValue = estimatedSlotValue(player.table, i);
    const nextTable = [...player.table];
    nextTable[i] = { card: drawn, faceUp: true };
    const nextValue = slotPointValue(nextTable, i);
    const improvement = currentValue - nextValue;
    if (improvement > bestImprovement) {
      bestImprovement = improvement;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function discardTakeImprovement(player: GolfPlayer, discardTop: Card): number {
  const slotIndex = bestSwapSlot(player, discardTop);
  const currentValue = estimatedSlotValue(player.table, slotIndex);
  const nextTable = [...player.table];
  nextTable[slotIndex] = { card: discardTop, faceUp: true };
  return currentValue - slotPointValue(nextTable, slotIndex);
}

export function runGolfBotTurn(state: unknown): unknown {
  const s = state as GolfState;
  if (s.gameOver || s.phase !== 'playing') return state;

  const current = s.players[s.currentPlayerIndex];
  if (!current?.isBot) return state;

  if (s.pendingDraw) {
    if (s.pendingDrawSource === 'stock') {
      const slotIndex = bestSwapSlot(current, s.pendingDraw);
      const currentValue = estimatedSlotValue(current.table, slotIndex);
      const nextTable = [...current.table];
      nextTable[slotIndex] = { card: s.pendingDraw, faceUp: true };
      const nextValue = slotPointValue(nextTable, slotIndex);
      if (currentValue - nextValue > 0) {
        return processGolfAction(s, { type: 'swap-with-slot', slotIndex }, current.id);
      }
      return processGolfAction(s, { type: 'discard-drawn' }, current.id);
    }
    const slotIndex = bestSwapSlot(current, s.pendingDraw);
    return processGolfAction(s, { type: 'swap-with-slot', slotIndex }, current.id);
  }

  const discardTop = s.discard[s.discard.length - 1];
  if (discardTop && discardTakeImprovement(current, discardTop) >= 2) {
    return processGolfAction(s, { type: 'take-discard' }, current.id);
  }

  if (canDrawFromStock(s, current.id)) {
    return processGolfAction(s, { type: 'draw-from-stock' }, current.id);
  }

  if (canTakeDiscard(s, current.id)) {
    return processGolfAction(s, { type: 'take-discard' }, current.id);
  }

  return state;
}

/** Test helper: build a hole from explicit table layouts. */
export function createGolfStateForTest(
  players: GolfPlayer[],
  holeNumber: number,
  options?: {
    stock?: Card[];
    discard?: Card[];
    currentPlayerIndex?: number;
    pendingDraw?: Card | null;
    pendingDrawSource?: 'stock' | 'discard' | null;
    endingRound?: boolean;
    finalTurnsLeft?: number;
    phase?: GolfState['phase'];
  },
): GolfState {
  return {
    players,
    stock: options?.stock ?? [],
    discard: options?.discard ?? [],
    currentPlayerIndex: options?.currentPlayerIndex ?? 0,
    holeNumber,
    phase: options?.phase ?? 'playing',
    pendingDraw: options?.pendingDraw ?? null,
    pendingDrawSource: options?.pendingDrawSource ?? null,
    endingRound: options?.endingRound ?? false,
    finalTurnsLeft: options?.finalTurnsLeft ?? 0,
    holeScores: {},
    holeSummary: '',
    gameOver: false,
    winners: [],
  };
}

export { cardEquals, scorePlayerTable, slotPointValue, buildInitialTable, startHole, endHole, finishGame };
