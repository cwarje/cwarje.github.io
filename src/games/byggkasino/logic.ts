import type { Player } from '../../networking/types';
import type {
  Card,
  Suit,
  Rank,
  ByggkasinoPlayer,
  ByggkasinoState,
  ByggkasinoAction,
  ByggkasinoActionAnnouncement,
  TableItem,
  TableSlot,
} from './types';
import { BYGG_TABLE_COLUMNS, cardEquals, minCardValueForSum } from './types';
import {
  isValidCapture,
  isValidBuild,
  isValidBuildExtension,
  isValidTableGroup,
  playerCanCaptureBuildValue,
  scoreRound,
  findPossibleCaptures,
  achievableSumsForCards,
  resolveTableGroupDeclaredValue,
} from './rules';

const SUITS: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts'];
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const DEFAULT_TARGET_SCORE = 21;

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

function occupiedTableEntries(tableSlots: TableSlot[]): Array<{ slotIndex: number; item: TableItem }> {
  const entries: Array<{ slotIndex: number; item: TableItem }> = [];
  for (let i = 0; i < tableSlots.length; i++) {
    const item = tableSlots[i];
    if (!item) continue;
    entries.push({ slotIndex: i, item });
  }
  return entries;
}

function ensureSlotCapacity(tableSlots: TableSlot[], tableRows: number, requiredSlotIndex: number): {
  tableSlots: TableSlot[];
  tableRows: number;
} {
  if (requiredSlotIndex < tableSlots.length) {
    return { tableSlots, tableRows };
  }
  const requiredRows = Math.floor(requiredSlotIndex / BYGG_TABLE_COLUMNS) + 1;
  if (requiredRows <= tableRows) {
    return { tableSlots, tableRows };
  }
  return {
    tableRows: requiredRows,
    tableSlots: [...tableSlots, ...Array((requiredRows - tableRows) * BYGG_TABLE_COLUMNS).fill(null)],
  };
}

function firstEmptySlotIndex(tableSlots: TableSlot[]): number {
  return tableSlots.findIndex(slot => slot == null);
}

function dealCards(state: ByggkasinoState): ByggkasinoState {
  const cardsPerPlayer = 4;
  let deck = [...state.deck];
  const players = state.players.map(p => {
    const hand = sortHand(deck.slice(0, cardsPerPlayer));
    deck = deck.slice(cardsPerPlayer);
    return { ...p, hand };
  });
  return { ...state, players, deck, actionAnnouncement: null, pendingCapturePreview: null };
}

function startRound(
  players: ByggkasinoPlayer[],
  roundNumber: number,
  dealerIndex: number,
  scores: Record<string, number>,
  targetScore: number
): ByggkasinoState {
  const deck = shuffle(createDeck());
  let cursor = 0;

  const cardsPerPlayer = 4;
  const dealtPlayers = players.map(p => {
    const hand = sortHand(deck.slice(cursor, cursor + cardsPerPlayer));
    cursor += cardsPerPlayer;
    return { ...p, hand, capturedCards: [], sweepCount: 0 };
  });

  const tableCards: TableItem[] = [];
  for (let i = 0; i < 4; i++) {
    tableCards.push({ kind: 'card', card: deck[cursor++] });
  }

  const firstToPlay = (dealerIndex + 1) % players.length;

  return {
    players: dealtPlayers,
    deck: deck.slice(cursor),
    tableRows: 1,
    tableSlots: tableCards,
    currentPlayerIndex: firstToPlay,
    dealerIndex,
    phase: 'playing',
    roundNumber,
    lastCapturerIndex: -1,
    scores,
    lastRoundScores: {},
    targetScore,
    gameOver: false,
    winners: [],
    actionAnnouncement: null,
    pendingCapturePreview: null,
  };
}

export function createByggkasinoState(
  players: Player[],
  options?: { targetScore?: number }
): ByggkasinoState {
  const targetScore = options?.targetScore ?? DEFAULT_TARGET_SCORE;

  const initialPlayers: ByggkasinoPlayer[] = players.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: p.isBot,
    hand: [],
    capturedCards: [],
    sweepCount: 0,
  }));

  const scores: Record<string, number> = {};
  for (const p of players) {
    scores[p.id] = 0;
  }

  return startRound(initialPlayers, 1, 0, scores, targetScore);
}

function advanceTurn(state: ByggkasinoState): ByggkasinoState {
  const allHandsEmpty = state.players.every(p => p.hand.length === 0);

  if (allHandsEmpty) {
    if (state.deck.length > 0) {
      return dealCards({ ...state, currentPlayerIndex: (state.dealerIndex + 1) % state.players.length });
    }
    return endRound(state);
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return { ...state, currentPlayerIndex: nextIndex };
}

/** After a play: redeal or round-end immediately; otherwise next player + announcement phase. */
function finishPlayWithOptionalAnnouncement(
  stateAfterPlay: ByggkasinoState,
  announcement: ByggkasinoActionAnnouncement
): ByggkasinoState {
  const allHandsEmpty = stateAfterPlay.players.every(p => p.hand.length === 0);
  if (allHandsEmpty) {
    return advanceTurn(stateAfterPlay);
  }
  const n = stateAfterPlay.players.length;
  const nextIndex = (stateAfterPlay.currentPlayerIndex + 1) % n;
  return {
    ...stateAfterPlay,
    currentPlayerIndex: nextIndex,
    phase: 'announcement',
    actionAnnouncement: announcement,
    pendingCapturePreview: null,
  };
}

function endRound(state: ByggkasinoState): ByggkasinoState {
  let players = [...state.players];

  if (state.lastCapturerIndex >= 0) {
    const tableItems = occupiedTableEntries(state.tableSlots).map(entry => entry.item);
    const remainingCards = tableItems
      .filter((it): it is { kind: 'card'; card: Card } => it.kind === 'card')
      .map(it => it.card);
    const remainingBuildCards = tableItems
      .filter((it): it is { kind: 'build'; build: { cards: Card[]; value: number; ownerId: string } } => it.kind === 'build')
      .flatMap(it => it.build.cards);

    players = players.map((p, i) =>
      i === state.lastCapturerIndex
        ? { ...p, capturedCards: [...p.capturedCards, ...remainingCards, ...remainingBuildCards] }
        : p
    );
  }

  const roundScores = scoreRound(players);

  const newScores = { ...state.scores };
  for (const p of players) {
    newScores[p.id] = (newScores[p.id] ?? 0) + (roundScores[p.id]?.total ?? 0);
  }

  const maxScore = Math.max(...Object.values(newScores));
  const isGameOver = maxScore >= state.targetScore;

  let winners: string[] = [];
  if (isGameOver) {
    winners = players.filter(p => newScores[p.id] === maxScore).map(p => p.id);
  }

  return {
    ...state,
    players,
    tableRows: 1,
    tableSlots: [],
    scores: newScores,
    lastRoundScores: roundScores,
    phase: isGameOver ? 'game-over' : 'round-end',
    gameOver: isGameOver,
    winners,
    actionAnnouncement: null,
    pendingCapturePreview: null,
  };
}

function removeCardFromHand(player: ByggkasinoPlayer, card: Card): ByggkasinoPlayer {
  const idx = player.hand.findIndex(c => cardEquals(c, card));
  if (idx === -1) return player;
  const hand = [...player.hand];
  hand.splice(idx, 1);
  return { ...player, hand };
}

export function processByggkasinoAction(
  state: unknown,
  action: unknown,
  playerId: string
): unknown {
  const s = state as ByggkasinoState;
  const a = action as ByggkasinoAction;

  if (!a || typeof a !== 'object' || !('type' in a)) return state;

  if (a.type === 'start-next-round') {
    if (s.phase !== 'round-end') return state;
    const newDealerIndex = (s.dealerIndex + 1) % s.players.length;
    const resetPlayers = s.players.map(p => ({
      ...p,
      hand: [],
      capturedCards: [],
      sweepCount: 0,
    }));
    return startRound(resetPlayers, s.roundNumber + 1, newDealerIndex, s.scores, s.targetScore);
  }

  if (a.type === 'finish-action-announcement') {
    if (s.phase !== 'announcement') return state;
    return { ...s, phase: 'playing', actionAnnouncement: null, pendingCapturePreview: null };
  }

  if (a.type === 'finalize-capture') {
    if (!s.pendingCapturePreview) return state;
    if (s.phase !== 'playing' || s.gameOver) return state;
    const { playedCard, capturedSlotIndices, playerId: capturePlayerId } = s.pendingCapturePreview;
    const playerIndex = s.players.findIndex(p => p.id === capturePlayerId);
    if (playerIndex === -1) return { ...s, pendingCapturePreview: null };
    const player = s.players[playerIndex];
    if (!player.hand.some(c => cardEquals(c, playedCard))) return { ...s, pendingCapturePreview: null };
    if (!isValidCapture(playedCard, s.tableSlots, capturedSlotIndices)) return { ...s, pendingCapturePreview: null };

    const capturedCards: Card[] = [playedCard];
    const newTableSlots = [...s.tableSlots];
    for (const idx of capturedSlotIndices) {
      const item = newTableSlots[idx];
      if (!item) continue;
      if (item.kind === 'card') {
        capturedCards.push(item.card);
      } else {
        capturedCards.push(...item.build.cards);
      }
      newTableSlots[idx] = null;
    }
    const isSweep = newTableSlots.every(slot => slot == null);
    const updatedPlayer = {
      ...removeCardFromHand(player, playedCard),
      capturedCards: [...player.capturedCards, ...capturedCards],
      sweepCount: player.sweepCount + (isSweep ? 1 : 0),
    };
    const newPlayers = s.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
    const capturedBuild = capturedSlotIndices.some(i => s.tableSlots[i]?.kind === 'build');
    return finishPlayWithOptionalAnnouncement(
      {
        ...s,
        players: newPlayers,
        tableSlots: newTableSlots,
        lastCapturerIndex: playerIndex,
      },
      {
        kind: 'capture',
        playerId: player.id,
        capturedCards,
        sweep: isSweep,
        capturedBuild,
      }
    );
  }

  if (s.phase !== 'playing') return state;
  if (s.gameOver) return state;
  if (s.pendingCapturePreview) return state;

  const playerIndex = s.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || playerIndex !== s.currentPlayerIndex) return state;
  const player = s.players[playerIndex];

  switch (a.type) {
    case 'capture-preview': {
      const { playedCard, capturedSlotIndices } = a;
      if (!player.hand.some(c => cardEquals(c, playedCard))) return state;
      if (!isValidCapture(playedCard, s.tableSlots, capturedSlotIndices)) return state;
      return {
        ...s,
        pendingCapturePreview: {
          playerId: player.id,
          playedCard,
          capturedSlotIndices,
        },
      };
    }

    case 'group-table': {
      const { tableCardIndices, declaredValue } = a;
      const hasOwnBuild = s.tableSlots.some(
        it => it?.kind === 'build' && it.build.ownerId === playerId
      );
      if (hasOwnBuild) return state;

      const unique = [...new Set(tableCardIndices)];
      if (unique.length < 2) return state;
      const sortedIdx = [...unique].sort((x, y) => x - y);
      const tableCards: Card[] = [];
      for (const idx of sortedIdx) {
        const item = s.tableSlots[idx];
        if (!item || item.kind !== 'card') return state;
        tableCards.push(item.card);
      }
      if (!isValidTableGroup(tableCards, declaredValue)) return state;
      if (!playerCanCaptureBuildValue(player.hand, declaredValue)) return state;

      const newTableSlots = [...s.tableSlots];
      for (const i of sortedIdx) {
        newTableSlots[i] = null;
      }
      const targetSlotIndex = sortedIdx[0];
      newTableSlots[targetSlotIndex] = {
        kind: 'build',
        build: { cards: tableCards, value: declaredValue, ownerId: playerId },
      };
      return { ...s, tableSlots: newTableSlots };
    }

    case 'build': {
      const { playedCard, tableCardIndices, declaredValue } = a;
      if (!player.hand.some(c => cardEquals(c, playedCard))) return state;
      if (!isValidBuild(playedCard, tableCardIndices, s.tableSlots, declaredValue)) return state;
      if (!playerCanCaptureBuildValue(player.hand, declaredValue, playedCard)) return state;

      const buildCards: Card[] = [playedCard];
      for (const idx of tableCardIndices) {
        const item = s.tableSlots[idx];
        if (item?.kind === 'card') buildCards.push(item.card);
      }

      const newTableSlots = [...s.tableSlots];
      for (const i of tableCardIndices) {
        newTableSlots[i] = null;
      }
      const newBuild: TableItem = {
        kind: 'build',
        build: { cards: buildCards, value: declaredValue, ownerId: playerId },
      };
      let targetSlotIndex = tableCardIndices[0];
      if (targetSlotIndex == null || targetSlotIndex < 0) return state;
      newTableSlots[targetSlotIndex] = newBuild;

      const updatedPlayer = removeCardFromHand(player, playedCard);
      const newPlayers = s.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

      return finishPlayWithOptionalAnnouncement(
        { ...s, players: newPlayers, tableSlots: newTableSlots },
        {
          kind: 'build',
          playerId: player.id,
          playedCard,
          declaredValue,
          tableCardCount: tableCardIndices.length,
        }
      );
    }

    case 'extend-build': {
      const { playedCard, buildIndex, declaredValue } = a;
      if (!player.hand.some(c => cardEquals(c, playedCard))) return state;

      const buildItem = s.tableSlots[buildIndex];
      if (!buildItem || buildItem.kind !== 'build') return state;
      if (!isValidBuildExtension(playedCard, buildItem.build, declaredValue)) return state;
      if (!playerCanCaptureBuildValue(player.hand, declaredValue, playedCard)) return state;

      const extendedBuild: TableItem = {
        kind: 'build',
        build: {
          cards: [...buildItem.build.cards, playedCard],
          value: declaredValue,
          ownerId: playerId,
        },
      };

      const newTableSlots = [...s.tableSlots];
      newTableSlots[buildIndex] = extendedBuild;
      const updatedPlayer = removeCardFromHand(player, playedCard);
      const newPlayers = s.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

      return finishPlayWithOptionalAnnouncement(
        { ...s, players: newPlayers, tableSlots: newTableSlots },
        {
          kind: 'extend-build',
          playerId: player.id,
          playedCard,
          declaredValue,
        }
      );
    }

    case 'trail': {
      const { playedCard, targetSlotIndex } = a;
      if (!player.hand.some(c => cardEquals(c, playedCard))) return state;

      const hasOwnBuild = s.tableSlots.some(
        it => it?.kind === 'build' && it.build.ownerId === playerId
      );
      if (hasOwnBuild) return state;
      if (targetSlotIndex < 0) return state;
      const expanded = ensureSlotCapacity(s.tableSlots, s.tableRows, targetSlotIndex);
      const newTableSlots = [...expanded.tableSlots];
      if (newTableSlots[targetSlotIndex] != null) return state;
      newTableSlots[targetSlotIndex] = { kind: 'card', card: playedCard };
      const updatedPlayer = removeCardFromHand(player, playedCard);
      const newPlayers = s.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

      return finishPlayWithOptionalAnnouncement(
        { ...s, players: newPlayers, tableSlots: newTableSlots, tableRows: expanded.tableRows },
        { kind: 'trail', playerId: player.id, playedCard }
      );
    }

    default:
      return state;
  }
}

export function isByggkasinoOver(state: unknown): boolean {
  return (state as ByggkasinoState).gameOver;
}

export function getByggkasinoWinners(state: unknown): string[] {
  return (state as ByggkasinoState).winners;
}

function tryLegalGroupTable(
  s: ByggkasinoState,
  hand: Card[]
): { tableCardIndices: number[]; declaredValue: number } | null {
  const loose: number[] = [];
  for (let i = 0; i < s.tableSlots.length; i++) {
    if (s.tableSlots[i]?.kind === 'card') loose.push(i);
  }
  const n = loose.length;
  for (let k = 2; k <= n; k++) {
    let found: { tableCardIndices: number[]; declaredValue: number } | null = null;
    const combo: number[] = [];
    function bt(start: number): boolean {
      if (combo.length === k) {
        const sortedIdx = [...combo].sort((a, b) => a - b);
        const tableCards = sortedIdx.map(i => (s.tableSlots[i] as { kind: 'card'; card: Card }).card);
        const d = resolveTableGroupDeclaredValue(tableCards, hand);
        if (d > 0) {
          found = { tableCardIndices: sortedIdx, declaredValue: d };
          return true;
        }
        return false;
      }
      for (let i = start; i < n; i++) {
        combo.push(loose[i]);
        if (bt(i + 1)) return true;
        combo.pop();
      }
      return false;
    }
    bt(0);
    if (found) return found;
  }
  return null;
}

export function runByggkasinoBotTurn(state: unknown): unknown {
  const s = state as ByggkasinoState;
  if (s.phase === 'round-end') {
    return processByggkasinoAction(s, { type: 'start-next-round' }, s.players[0].id);
  }
  if (s.phase === 'announcement') return state;
  if (s.phase !== 'playing' || s.gameOver) return state;
  if (s.pendingCapturePreview) return state;

  const player = s.players[s.currentPlayerIndex];
  if (!player.isBot) return state;

  for (const card of player.hand) {
    const captures = findPossibleCaptures(card, s.tableSlots);
    if (captures.length > 0) {
      const bestCapture = captures.reduce((best, curr) => (curr.length > best.length ? curr : best), captures[0]);
      const result = processByggkasinoAction(
        s,
        { type: 'capture-preview', playedCard: card, capturedSlotIndices: bestCapture },
        player.id
      );
      if (result !== state) return result;
    }
  }

  const groupMove = tryLegalGroupTable(s, player.hand);
  if (groupMove) {
    const result = processByggkasinoAction(
      s,
      { type: 'group-table', tableCardIndices: groupMove.tableCardIndices, declaredValue: groupMove.declaredValue },
      player.id
    );
    if (result !== state) return result;
  }

  const occupied = occupiedTableEntries(s.tableSlots);
  for (const card of player.hand) {
    for (const { slotIndex: i, item } of occupied) {
      if (item.kind !== 'card') continue;
      const sums = achievableSumsForCards([card, item.card]);
      for (const declaredValue of sums) {
        if (declaredValue < 1) continue;
        if (!playerCanCaptureBuildValue(player.hand, declaredValue, card)) continue;
        if (!isValidBuild(card, [i], s.tableSlots, declaredValue)) continue;
        const result = processByggkasinoAction(
          s,
          { type: 'build', playedCard: card, tableCardIndices: [i], declaredValue },
          player.id
        );
        if (result !== state) return result;
      }
    }
  }

  const hasOwnBuild = s.tableSlots.some(
    it => it?.kind === 'build' && it.build.ownerId === player.id
  );
  if (hasOwnBuild) {
    const lowestCard = [...player.hand].sort((a, b) => minCardValueForSum(a) - minCardValueForSum(b))[0];
    if (lowestCard) {
      for (const card of player.hand) {
        const captures = findPossibleCaptures(card, s.tableSlots);
        if (captures.length > 0) {
          const result = processByggkasinoAction(
            s,
            { type: 'capture-preview', playedCard: card, capturedSlotIndices: captures[0] },
            player.id
          );
          if (result !== state) return result;
        }
      }
    }
  }

  const trailCard = [...player.hand].sort((a, b) => {
    if (a.rank === 1) return 1;
    if (b.rank === 1) return -1;
    return a.rank - b.rank;
  })[0];

  const fallbackTrailTarget = (() => {
    const open = firstEmptySlotIndex(s.tableSlots);
    if (open >= 0) return open;
    return s.tableRows * BYGG_TABLE_COLUMNS;
  })();

  if (trailCard) {
    const result = processByggkasinoAction(
      s,
      { type: 'trail', playedCard: trailCard, targetSlotIndex: fallbackTrailTarget },
      player.id
    );
    if (result !== state) return result;
  }

  if (player.hand.length > 0) {
    return processByggkasinoAction(
      s,
      { type: 'trail', playedCard: player.hand[0], targetSlotIndex: fallbackTrailTarget },
      player.id
    );
  }

  return state;
}
