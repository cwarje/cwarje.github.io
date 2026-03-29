import type { CasinoMatchLength, Player } from '../../networking/types';
import type {
  Build,
  Card,
  Suit,
  Rank,
  CasinoPlayer,
  CasinoState,
  CasinoAction,
  CasinoActionAnnouncement,
  PendingCapturePreview,
  TableItem,
  TableSlot,
} from './types';
import {
  CASINO_TABLE_COLUMNS,
  canParticipateInBuildOrSum,
  cardEquals,
  isFiveOfSpadesSweepCard,
  minCardValueForSum,
  occupiedTableSlotIndices,
} from './types';
import {
  isValidCapture,
  isValidBuild,
  isValidBuildExtension,
  isValidTableGroup,
  canAssignSumToCards,
  playerCanCaptureBuildValue,
  scoreRound,
  findPossibleCaptures,
  achievableSumsForCards,
  resolveTableGroupDeclaredValue,
  resolveHandAssistedGroupDeclaredValue,
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

export function countRemnantCardsOnTable(tableSlots: TableSlot[]): number {
  const tableItems = occupiedTableEntries(tableSlots).map(entry => entry.item);
  const looseCards = tableItems.filter((it): it is { kind: 'card'; card: Card } => it.kind === 'card').length;
  const buildCards = tableItems
    .filter((it): it is { kind: 'build'; build: Build } => it.kind === 'build')
    .reduce((sum, it) => sum + it.build.cards.length, 0);
  return looseCards + buildCards;
}

function ensureSlotCapacity(tableSlots: TableSlot[], tableRows: number, requiredSlotIndex: number): {
  tableSlots: TableSlot[];
  tableRows: number;
} {
  if (requiredSlotIndex < tableSlots.length) {
    return { tableSlots, tableRows };
  }
  const requiredRows = Math.floor(requiredSlotIndex / CASINO_TABLE_COLUMNS) + 1;
  if (requiredRows <= tableRows) {
    return { tableSlots, tableRows };
  }
  return {
    tableRows: requiredRows,
    tableSlots: [...tableSlots, ...Array((requiredRows - tableRows) * CASINO_TABLE_COLUMNS).fill(null)],
  };
}

function firstEmptySlotIndex(tableSlots: TableSlot[]): number {
  return tableSlots.findIndex(slot => slot == null);
}

function dealCards(state: CasinoState): CasinoState {
  const cardsPerPlayer = 4;
  let deck = [...state.deck];
  const players = state.players.map(p => {
    const hand = sortHand(deck.slice(0, cardsPerPlayer));
    deck = deck.slice(cardsPerPlayer);
    return { ...p, hand };
  });
  const prevDeal = state.dealNumberInRound ?? 1;
  return {
    ...state,
    players,
    deck,
    dealNumberInRound: prevDeal + 1,
    actionAnnouncement: null,
    pendingCapturePreview: null,
  };
}

function startRound(
  players: CasinoPlayer[],
  roundNumber: number,
  dealerIndex: number,
  scores: Record<string, number>,
  targetScore: number,
  matchLength: CasinoMatchLength
): CasinoState {
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
    dealNumberInRound: 1,
    lastCapturerIndex: -1,
    scores,
    lastRoundScores: {},
    matchLength,
    targetScore,
    gameOver: false,
    winners: [],
    actionAnnouncement: null,
    pendingCapturePreview: null,
  };
}

export function createCasinoState(
  players: Player[],
  options?: { matchLength?: CasinoMatchLength }
): CasinoState {
  const matchLength = options?.matchLength ?? 'to21';
  const targetScore =
    matchLength === 'to11' ? 11 : matchLength === 'to21' ? DEFAULT_TARGET_SCORE : 0;

  const initialPlayers: CasinoPlayer[] = players.map(p => ({
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

  return startRound(initialPlayers, 1, 0, scores, targetScore, matchLength);
}

function advanceTurn(state: CasinoState): CasinoState {
  const allHandsEmpty = state.players.every(p => p.hand.length === 0);

  if (allHandsEmpty) {
    if (state.deck.length > 0) {
      return dealCards({ ...state, currentPlayerIndex: (state.dealerIndex + 1) % state.players.length });
    }
    return enterTableRemnantPhase(state);
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return { ...state, currentPlayerIndex: nextIndex };
}

function enterTableRemnantPhase(state: CasinoState): CasinoState {
  return {
    ...state,
    phase: 'table-remnant',
    actionAnnouncement: null,
    pendingCapturePreview: null,
  };
}

/** After a play: redeal or round-end immediately; otherwise next player + announcement phase. */
function finishPlayWithOptionalAnnouncement(
  stateAfterPlay: CasinoState,
  announcement: CasinoActionAnnouncement
): CasinoState {
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

function endRound(state: CasinoState): CasinoState {
  let players = [...state.players];

  if (state.lastCapturerIndex >= 0) {
    const tableItems = occupiedTableEntries(state.tableSlots).map(entry => entry.item);
    const remainingCards = tableItems
      .filter((it): it is { kind: 'card'; card: Card } => it.kind === 'card')
      .map(it => it.card);
    const remainingBuildCards = tableItems
      .filter((it): it is { kind: 'build'; build: Build } => it.kind === 'build')
      .flatMap(it => it.build.cards);

    players = players.map((p, i) =>
      i === state.lastCapturerIndex
        ? { ...p, capturedCards: [...p.capturedCards, ...remainingCards, ...remainingBuildCards] }
        : p
    );
  }

  const lastCapturePlayerId =
    state.lastCapturerIndex >= 0 ? players[state.lastCapturerIndex]!.id : null;
  const roundScores = scoreRound(players, lastCapturePlayerId);

  const newScores = { ...state.scores };
  for (const p of players) {
    newScores[p.id] = (newScores[p.id] ?? 0) + (roundScores[p.id]?.total ?? 0);
  }

  const maxScore = Math.max(...Object.values(newScores));
  const isGameOver =
    state.matchLength === 'eachDealerOnce'
      ? state.roundNumber >= state.players.length
      : maxScore >= state.targetScore;

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

function removeCardFromHand(player: CasinoPlayer, card: Card): CasinoPlayer {
  const idx = player.hand.findIndex(c => cardEquals(c, card));
  if (idx === -1) return player;
  const hand = [...player.hand];
  hand.splice(idx, 1);
  return { ...player, hand };
}

function captureSlotsFromIndices(
  tableSlots: TableSlot[],
  playedCard: Card,
  capturedSlotIndices: number[]
): { capturedCards: Card[]; newTableSlots: TableSlot[]; sweep: boolean; capturedBuild: boolean } {
  const capturedCards: Card[] = [playedCard];
  const newTableSlots = [...tableSlots];
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
  const sweep = newTableSlots.every(slot => slot == null);
  const capturedBuild = capturedSlotIndices.some(i => tableSlots[i]?.kind === 'build');
  return { capturedCards, newTableSlots, sweep, capturedBuild };
}

function tryApplyFiveOfSpadesTableSweep(
  s: CasinoState,
  playerIndex: number,
  playedCard: Card
): CasinoState | null {
  if (!isFiveOfSpadesSweepCard(playedCard)) return null;
  const player = s.players[playerIndex];
  if (!player.hand.some(c => cardEquals(c, playedCard))) return null;

  const indices = occupiedTableSlotIndices(s.tableSlots).sort((a, b) => a - b);
  const outcome = captureSlotsFromIndices(s.tableSlots, playedCard, indices);
  const updatedPlayer = {
    ...removeCardFromHand(player, playedCard),
    capturedCards: [...player.capturedCards, ...outcome.capturedCards],
    sweepCount: player.sweepCount + (outcome.sweep ? 1 : 0),
  };
  const newPlayers = s.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
  return finishPlayWithOptionalAnnouncement(
    {
      ...s,
      players: newPlayers,
      tableSlots: outcome.newTableSlots,
      lastCapturerIndex: playerIndex,
    },
    {
      kind: 'capture',
      playerId: player.id,
      capturedCards: outcome.capturedCards,
      sweep: outcome.sweep,
      capturedBuild: outcome.capturedBuild,
    }
  );
}

/** Same card list / sweep / build flags as `finalize-capture` will apply; for HUD during preview. */
export function getCaptureOutcomeFromPreview(
  s: CasinoState,
  preview: PendingCapturePreview
): { capturedCards: Card[]; newTableSlots: TableSlot[]; sweep: boolean; capturedBuild: boolean } | null {
  const { playedCard, capturedSlotIndices, playerId: capturePlayerId } = preview;
  const playerIndex = s.players.findIndex(p => p.id === capturePlayerId);
  if (playerIndex === -1) return null;
  if (!isValidCapture(playedCard, s.tableSlots, capturedSlotIndices)) return null;

  return captureSlotsFromIndices(s.tableSlots, playedCard, capturedSlotIndices);
}

export function processCasinoAction(
  state: unknown,
  action: unknown,
  playerId: string
): unknown {
  const s = state as CasinoState;
  const a = action as CasinoAction;

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
    return startRound(
      resetPlayers,
      s.roundNumber + 1,
      newDealerIndex,
      s.scores,
      s.targetScore,
      s.matchLength
    );
  }

  if (a.type === 'finish-action-announcement') {
    if (s.phase !== 'announcement') return state;
    return { ...s, phase: 'playing', actionAnnouncement: null, pendingCapturePreview: null };
  }

  if (a.type === 'finish-table-remnant') {
    if (s.phase !== 'table-remnant') return state;
    return endRound(s);
  }

  if (a.type === 'finalize-capture') {
    if (!s.pendingCapturePreview) return state;
    if (s.phase !== 'playing' || s.gameOver) return state;
    const previewSnapshot = s.pendingCapturePreview;
    const outcome = getCaptureOutcomeFromPreview(s, previewSnapshot);
    if (!outcome) {
      const pi = s.players.findIndex(p => p.id === previewSnapshot.playerId);
      if (pi === -1) return { ...s, pendingCapturePreview: null };
      const p = s.players[pi];
      const needsRestore = !p.hand.some(c => cardEquals(c, previewSnapshot.playedCard));
      const restored = needsRestore
        ? { ...p, hand: [...p.hand, previewSnapshot.playedCard] }
        : p;
      return {
        ...s,
        pendingCapturePreview: null,
        players: s.players.map((pl, i) => (i === pi ? restored : pl)),
      };
    }
    const { playerId: capturePlayerId } = previewSnapshot;
    const playerIndex = s.players.findIndex(p => p.id === capturePlayerId);
    const player = s.players[playerIndex];
    const { capturedCards, newTableSlots, sweep: isSweep, capturedBuild } = outcome;
    const updatedPlayer = {
      ...player,
      capturedCards: [...player.capturedCards, ...capturedCards],
      sweepCount: player.sweepCount + (isSweep ? 1 : 0),
    };
    const newPlayers = s.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
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
      const fiveSweep = tryApplyFiveOfSpadesTableSweep(s, playerIndex, playedCard);
      if (fiveSweep) return fiveSweep;
      if (!isValidCapture(playedCard, s.tableSlots, capturedSlotIndices)) return state;
      const playerWithoutPlayed = removeCardFromHand(player, playedCard);
      const newPlayers = s.players.map((p, i) => (i === playerIndex ? playerWithoutPlayed : p));
      return {
        ...s,
        players: newPlayers,
        pendingCapturePreview: {
          playerId: player.id,
          playedCard,
          capturedSlotIndices,
        },
      };
    }

    case 'group-table': {
      const { tableCardIndices, declaredValue, playedCard } = a;
      const unique = [...new Set(tableCardIndices)];
      const isHandAssistedGroup = playedCard != null;
      if (!isHandAssistedGroup && unique.length < 2) return state;
      if (isHandAssistedGroup && unique.length !== 1) return state;
      const sortedIdx = [...unique].sort((x, y) => x - y);

      if (isHandAssistedGroup) {
        if (!player.hand.some(c => cardEquals(c, playedCard))) return state;
        const fiveSweepGroup = tryApplyFiveOfSpadesTableSweep(s, playerIndex, playedCard);
        if (fiveSweepGroup) return fiveSweepGroup;

        const resolvedValue = resolveHandAssistedGroupDeclaredValue(
          playedCard,
          s.tableSlots,
          sortedIdx,
          player.hand
        );
        if (resolvedValue <= 0 || resolvedValue !== declaredValue) return state;

        const selectedIndex = sortedIdx[0];
        const selectedItem = s.tableSlots[selectedIndex];
        if (!selectedItem) return state;

        const hasOwnBuildOtherValue = s.tableSlots.some(
          it => it?.kind === 'build' && it.build.ownerId === playerId && it.build.value !== declaredValue
        );
        if (hasOwnBuildOtherValue) return state;

        const newTableSlots = [...s.tableSlots];
        if (selectedItem.kind === 'build') {
          newTableSlots[selectedIndex] = {
            kind: 'build',
            build: {
              cards: [...selectedItem.build.cards, playedCard],
              value: declaredValue,
              ownerId: playerId,
              groupCount: selectedItem.build.groupCount + 1,
            },
          };
        } else {
          const ownedBuildEntry = s.tableSlots
            .map((it, i) => ({ it, i }))
            .find(({ it, i }) =>
              i !== selectedIndex &&
              it?.kind === 'build' &&
              it.build.ownerId === playerId &&
              it.build.value === declaredValue
            );

          newTableSlots[selectedIndex] = null;
          if (ownedBuildEntry) {
            const existing = (ownedBuildEntry.it as { kind: 'build'; build: Build }).build;
            newTableSlots[ownedBuildEntry.i] = {
              kind: 'build',
              build: {
                cards: [...existing.cards, selectedItem.card, playedCard],
                value: declaredValue,
                ownerId: playerId,
                groupCount: existing.groupCount + 1,
              },
            };
          } else {
            newTableSlots[selectedIndex] = {
              kind: 'build',
              build: {
                cards: [selectedItem.card, playedCard],
                value: declaredValue,
                ownerId: playerId,
                groupCount: 2,
              },
            };
          }
        }

        const updatedPlayer = removeCardFromHand(player, playedCard);
        const newPlayers = s.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
        return finishPlayWithOptionalAnnouncement(
          { ...s, players: newPlayers, tableSlots: newTableSlots },
          {
            kind: 'build',
            playerId: player.id,
            playedCard,
            declaredValue,
            buildCards:
              selectedItem.kind === 'build'
                ? [...selectedItem.build.cards, playedCard]
                : [selectedItem.card, playedCard],
          }
        );
      }

      const looseCards: Card[] = [];
      const selectedBuilds: { index: number; build: Build }[] = [];
      for (const idx of sortedIdx) {
        const item = s.tableSlots[idx];
        if (!item) return state;
        if (item.kind === 'card') {
          looseCards.push(item.card);
        } else {
          selectedBuilds.push({ index: idx, build: item.build });
        }
      }

      if (selectedBuilds.length === 0) {
        if (!isValidTableGroup(looseCards, declaredValue)) return state;
        if (!playerCanCaptureBuildValue(player.hand, declaredValue)) return state;

        const ownedBuildEntry = s.tableSlots
          .map((it, i) => ({ it, i }))
          .find(({ it }) => it?.kind === 'build' && it.build.ownerId === playerId && it.build.value === declaredValue);

        const hasOwnBuildOtherValue = s.tableSlots.some(
          it => it?.kind === 'build' && it.build.ownerId === playerId && it.build.value !== declaredValue
        );
        if (hasOwnBuildOtherValue) return state;

        const newTableSlots = [...s.tableSlots];
        for (const i of sortedIdx) newTableSlots[i] = null;

        if (ownedBuildEntry) {
          const existing = (ownedBuildEntry.it as { kind: 'build'; build: Build }).build;
          newTableSlots[ownedBuildEntry.i] = {
            kind: 'build',
            build: {
              cards: [...existing.cards, ...looseCards],
              value: declaredValue,
              ownerId: playerId,
              groupCount: existing.groupCount + 1,
            },
          };
        } else {
          newTableSlots[sortedIdx[0]] = {
            kind: 'build',
            build: { cards: looseCards, value: declaredValue, ownerId: playerId, groupCount: 1 },
          };
        }
        return { ...s, tableSlots: newTableSlots };
      }

      if (!selectedBuilds.every(b => b.build.value === declaredValue)) return state;
      if (looseCards.length > 0) {
        const looseOk =
          looseCards.length >= 2
            ? isValidTableGroup(looseCards, declaredValue)
            : canParticipateInBuildOrSum(looseCards[0]) &&
              canAssignSumToCards(looseCards, declaredValue);
        if (!looseOk) return state;
      }
      const totalComponents = selectedBuilds.length + (looseCards.length > 0 ? 1 : 0);
      if (totalComponents < 2) return state;
      if (!playerCanCaptureBuildValue(player.hand, declaredValue)) return state;

      const hasOwnBuildOtherValue = s.tableSlots.some(
        it => it?.kind === 'build' && it.build.ownerId === playerId && it.build.value !== declaredValue
      );
      if (hasOwnBuildOtherValue) return state;

      const allCards = selectedBuilds.flatMap(b => b.build.cards).concat(looseCards);
      const mergedGroupCount =
        selectedBuilds.reduce((sum, b) => sum + b.build.groupCount, 0) +
        (looseCards.length > 0 ? 1 : 0);

      const newTableSlots = [...s.tableSlots];
      for (const i of sortedIdx) newTableSlots[i] = null;
      newTableSlots[sortedIdx[0]] = {
        kind: 'build',
        build: {
          cards: allCards,
          value: declaredValue,
          ownerId: playerId,
          groupCount: mergedGroupCount,
        },
      };
      return { ...s, tableSlots: newTableSlots };
    }

    case 'build': {
      const { playedCard, tableCardIndices, declaredValue } = a;
      if (!player.hand.some(c => cardEquals(c, playedCard))) return state;
      const fiveSweepBuild = tryApplyFiveOfSpadesTableSweep(s, playerIndex, playedCard);
      if (fiveSweepBuild) return fiveSweepBuild;

      const looseCardIndices = tableCardIndices.filter(i => s.tableSlots[i]?.kind === 'card');
      const buildIndices = tableCardIndices.filter(i => s.tableSlots[i]?.kind === 'build');
      if (looseCardIndices.length === 0) return state;

      if (!isValidBuild(playedCard, looseCardIndices, s.tableSlots, declaredValue)) return state;
      if (!playerCanCaptureBuildValue(player.hand, declaredValue, playedCard)) return state;

      for (const i of buildIndices) {
        const item = s.tableSlots[i];
        if (!item || item.kind !== 'build' || item.build.value !== declaredValue) return state;
      }

      const buildCards: Card[] = [playedCard];
      for (const idx of looseCardIndices) {
        const item = s.tableSlots[idx];
        if (item?.kind === 'card') buildCards.push(item.card);
      }
      for (const idx of buildIndices) {
        const item = s.tableSlots[idx];
        if (item?.kind === 'build') buildCards.push(...item.build.cards);
      }

      const mergedGroupCount = buildIndices.reduce((sum, i) => {
        const item = s.tableSlots[i];
        return sum + (item?.kind === 'build' ? item.build.groupCount : 0);
      }, 0);

      const newTableSlots = [...s.tableSlots];
      for (const i of tableCardIndices) {
        newTableSlots[i] = null;
      }
      const newBuild: TableItem = {
        kind: 'build',
        build: { cards: buildCards, value: declaredValue, ownerId: playerId, groupCount: mergedGroupCount + 1 },
      };
      const targetSlotIndex = looseCardIndices[0];
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
          buildCards,
        }
      );
    }

    case 'extend-build': {
      const { playedCard, buildIndex, declaredValue } = a;
      if (!player.hand.some(c => cardEquals(c, playedCard))) return state;
      const fiveSweepExtend = tryApplyFiveOfSpadesTableSweep(s, playerIndex, playedCard);
      if (fiveSweepExtend) return fiveSweepExtend;

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
          groupCount: buildItem.build.groupCount,
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
      const fiveSweepTrail = tryApplyFiveOfSpadesTableSweep(s, playerIndex, playedCard);
      if (fiveSweepTrail) return fiveSweepTrail;

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

export function isCasinoOver(state: unknown): boolean {
  return (state as CasinoState).gameOver;
}

export function getCasinoWinners(state: unknown): string[] {
  return (state as CasinoState).winners;
}

function tryLegalGroupTable(
  s: CasinoState,
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

export function runCasinoBotTurn(state: unknown): unknown {
  const s = state as CasinoState;
  if (s.phase === 'round-end') return state;
  if (s.phase === 'announcement') return state;
  if (s.phase === 'table-remnant') return state;
  if (s.phase !== 'playing' || s.gameOver) return state;
  if (s.pendingCapturePreview) return state;

  const player = s.players[s.currentPlayerIndex];
  if (!player.isBot) return state;

  for (const card of player.hand) {
    const captures = findPossibleCaptures(card, s.tableSlots);
    if (captures.length > 0) {
      const bestCapture = captures.reduce((best, curr) => (curr.length > best.length ? curr : best), captures[0]);
      const result = processCasinoAction(
        s,
        { type: 'capture-preview', playedCard: card, capturedSlotIndices: bestCapture },
        player.id
      );
      if (result !== state) return result;
    }
  }

  const groupMove = tryLegalGroupTable(s, player.hand);
  if (groupMove) {
    const result = processCasinoAction(
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
        const result = processCasinoAction(
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
          const result = processCasinoAction(
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
    return s.tableRows * CASINO_TABLE_COLUMNS;
  })();

  if (trailCard) {
    const result = processCasinoAction(
      s,
      { type: 'trail', playedCard: trailCard, targetSlotIndex: fallbackTrailTarget },
      player.id
    );
    if (result !== state) return result;
  }

  if (player.hand.length > 0) {
    return processCasinoAction(
      s,
      { type: 'trail', playedCard: player.hand[0], targetSlotIndex: fallbackTrailTarget },
      player.id
    );
  }

  return state;
}
