import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import {
  createCasinoState,
  getCaptureOutcomeFromPreview,
  processCasinoAction,
  runCasinoBotTurn,
} from './logic';
import type { CasinoState, Card } from './types';

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    color: 'red',
    isBot: false,
    isHost: id === 'p0',
    connected: true,
  };
}

describe('casino trail', () => {
  it('playedCard removes card from hand and adds it to the table', () => {
    const s = createCasinoState([makePlayer('p0', 'A'), makePlayer('p1', 'B')]) as CasinoState;
    const idx = s.currentPlayerIndex;
    const pid = s.players[idx].id;
    const card = s.players[idx].hand[0];
    const tableLenBefore = s.tableSlots.filter(Boolean).length;
    const handLenBefore = s.players[idx].hand.length;
    const firstOpen = s.tableSlots.findIndex(slot => slot == null);
    const targetSlotIndex = firstOpen >= 0 ? firstOpen : s.tableRows * 4;

    const next = processCasinoAction(
      s,
      { type: 'trail', playedCard: card, targetSlotIndex },
      pid
    ) as CasinoState;

    expect(next).not.toBe(s);
    expect(next.phase).toBe('announcement');
    expect(next.actionAnnouncement).toEqual({
      kind: 'trail',
      playerId: pid,
      playedCard: card,
    });
    expect(next.players[idx].hand).toHaveLength(handLenBefore - 1);
    expect(next.players[idx].hand.some(c => c.suit === card.suit && c.rank === card.rank)).toBe(false);
    expect(next.tableSlots.filter(Boolean)).toHaveLength(tableLenBefore + 1);
    expect(next.tableSlots[targetSlotIndex]).toEqual({ kind: 'card', card });

    const afterHud = processCasinoAction(next, { type: 'finish-action-announcement' }, '') as CasinoState;
    expect(afterHud.phase).toBe('playing');
    expect(afterHud.actionAnnouncement).toBeNull();
  });

  it('rejects trail when current player owns a build on the table', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 9 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 4 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [
              { suit: 'clubs', rank: 2 },
              { suit: 'diamonds', rank: 3 },
            ],
            value: 5,
            ownerId: 'p0',
            groupCount: 1,
          },
        },
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'trail', playedCard: { suit: 'hearts', rank: 9 }, targetSlotIndex: 1 },
      'p0'
    );
    expect(next).toBe(s);
  });
});

describe('casino group-table then capture', () => {
  it('groups loose cards without advancing turn, then capture finalizes', () => {
    const six: Card = { suit: 'diamonds', rank: 6 };
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [six],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        { kind: 'card', card: { suit: 'clubs', rank: 3 } },
        { kind: 'card', card: { suit: 'hearts', rank: 3 } },
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const grouped = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [0, 1], declaredValue: 6 },
      'p0'
    ) as CasinoState;

    expect(grouped).not.toBe(s);
    expect(grouped.currentPlayerIndex).toBe(0);
    expect(grouped.phase).toBe('playing');
    expect(grouped.players[0].hand).toHaveLength(1);
    expect(grouped.tableSlots[0]?.kind).toBe('build');
    expect(grouped.tableSlots[1]).toBeNull();

    const preview = processCasinoAction(
      grouped,
      { type: 'capture-preview', playedCard: six, capturedSlotIndices: [0] },
      'p0'
    ) as CasinoState;
    expect(preview.pendingCapturePreview).not.toBeNull();
    expect(preview.players[0].hand).toHaveLength(0);

    const fromHelper = getCaptureOutcomeFromPreview(preview, preview.pendingCapturePreview!);
    expect(fromHelper).not.toBeNull();

    const finalized = processCasinoAction(preview, { type: 'finalize-capture' }, '') as CasinoState;
    expect(finalized.pendingCapturePreview).toBeNull();
    expect(finalized.phase).toBe('announcement');
    expect(finalized.players[0].hand).toHaveLength(0);
    expect(finalized.players[0].capturedCards).toHaveLength(3);
    expect(finalized.actionAnnouncement?.kind).toBe('capture');
    if (finalized.actionAnnouncement?.kind === 'capture' && fromHelper) {
      expect(fromHelper.capturedCards).toEqual(finalized.actionAnnouncement.capturedCards);
      expect(fromHelper.sweep).toBe(finalized.actionAnnouncement.sweep);
      expect(fromHelper.capturedBuild).toBe(finalized.actionAnnouncement.capturedBuild);
    }
  });
});

describe('casino 5 of spades sweep', () => {
  const S5: Card = { suit: 'spades', rank: 5 };

  it('trail with 5♠ sweeps entire table and awards sweep', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [S5],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        { kind: 'card', card: { suit: 'clubs', rank: 2 } },
        { kind: 'card', card: { suit: 'clubs', rank: 3 } },
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'trail', playedCard: S5, targetSlotIndex: 2 },
      'p0'
    ) as CasinoState;

    expect(next.pendingCapturePreview).toBeNull();
    expect(next.phase).toBe('announcement');
    expect(next.actionAnnouncement?.kind).toBe('capture');
    if (next.actionAnnouncement?.kind === 'capture') {
      expect(next.actionAnnouncement.sweep).toBe(true);
      expect(next.actionAnnouncement.capturedBuild).toBe(false);
    }
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.players[0].sweepCount).toBe(1);
    expect(next.players[0].capturedCards).toHaveLength(3);
    expect(next.tableSlots.every(slot => slot == null)).toBe(true);
    expect(next.lastCapturerIndex).toBe(0);
  });

  it('capture-preview with 5♠ resolves immediately without pending preview', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [S5],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [{ kind: 'card', card: { suit: 'diamonds', rank: 9 } }, null, null, null],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'capture-preview', playedCard: S5, capturedSlotIndices: [0] },
      'p0'
    ) as CasinoState;

    expect(next.pendingCapturePreview).toBeNull();
    expect(next.actionAnnouncement?.kind).toBe('capture');
    expect(next.players[0].sweepCount).toBe(1);
    expect(next.tableSlots.every(slot => slot == null)).toBe(true);
  });

  it('trail 5♠ on empty table sweeps itself and awards sweep', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [S5],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [null, null, null, null],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'trail', playedCard: S5, targetSlotIndex: 0 },
      'p0'
    ) as CasinoState;

    expect(next.players[0].sweepCount).toBe(1);
    expect(next.actionAnnouncement?.kind).toBe('capture');
    if (next.actionAnnouncement?.kind === 'capture') {
      expect(next.actionAnnouncement.sweep).toBe(true);
      expect(next.actionAnnouncement.capturedCards).toEqual([S5]);
    }
    expect(next.players[0].capturedCards).toEqual([S5]);
    expect(next.tableSlots.every(slot => slot == null)).toBe(true);
    expect(next.lastCapturerIndex).toBe(0);
  });

  it('capture-preview 5♠ on empty table with empty indices sweeps immediately', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [S5],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [null, null, null, null],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'capture-preview', playedCard: S5, capturedSlotIndices: [] },
      'p0'
    ) as CasinoState;

    expect(next.pendingCapturePreview).toBeNull();
    expect(next.actionAnnouncement?.kind).toBe('capture');
    expect(next.players[0].sweepCount).toBe(1);
    expect(next.players[0].capturedCards).toEqual([S5]);
    expect(next.tableSlots.every(slot => slot == null)).toBe(true);
  });

  it('build with 5♠ on non-empty table sweeps instead of building', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [S5, { suit: 'hearts', rank: 9 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [{ kind: 'card', card: { suit: 'clubs', rank: 3 } }, null, null, null],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'build', playedCard: S5, tableCardIndices: [0], declaredValue: 8 },
      'p0'
    ) as CasinoState;

    expect(next.actionAnnouncement?.kind).toBe('capture');
    expect(next.players[0].sweepCount).toBe(1);
    expect(next.players[0].hand).toHaveLength(1);
    expect(next.tableSlots.every(slot => slot == null)).toBe(true);
  });

  it('extend-build with 5♠ on non-empty table sweeps including builds', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [S5],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [
              { suit: 'clubs', rank: 2 },
              { suit: 'diamonds', rank: 3 },
            ],
            value: 5,
            ownerId: 'p0',
            groupCount: 1,
          },
        },
        null,
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'extend-build', playedCard: S5, buildIndex: 0, declaredValue: 99 },
      'p0'
    ) as CasinoState;

    expect(next.actionAnnouncement?.kind).toBe('capture');
    if (next.actionAnnouncement?.kind === 'capture') {
      expect(next.actionAnnouncement.sweep).toBe(true);
      expect(next.actionAnnouncement.capturedBuild).toBe(true);
    }
    expect(next.players[0].sweepCount).toBe(1);
    expect(next.players[0].capturedCards.length).toBeGreaterThanOrEqual(3);
    expect(next.tableSlots.every(slot => slot == null)).toBe(true);
  });
});

describe('casino double/triple builds', () => {
  it('groups loose A+6 into existing owned 7-build to create D7', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 7 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'clubs', rank: 3 }, { suit: 'diamonds', rank: 4 }],
            value: 7,
            ownerId: 'p0',
            groupCount: 1,
          },
        },
        { kind: 'card', card: { suit: 'hearts', rank: 1 } },
        { kind: 'card', card: { suit: 'clubs', rank: 6 } },
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const grouped = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [1, 2], declaredValue: 7 },
      'p0'
    ) as CasinoState;

    expect(grouped).not.toBe(s);
    expect(grouped.currentPlayerIndex).toBe(0);
    const buildSlot = grouped.tableSlots[0];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.value).toBe(7);
      expect(buildSlot.build.groupCount).toBe(2);
      expect(buildSlot.build.cards).toHaveLength(4);
    }
    expect(grouped.tableSlots[1]).toBeNull();
    expect(grouped.tableSlots[2]).toBeNull();
  });

  it('captures D7 build with a 7 from hand', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 7 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [
              { suit: 'clubs', rank: 3 }, { suit: 'diamonds', rank: 4 },
              { suit: 'hearts', rank: 1 }, { suit: 'clubs', rank: 6 },
            ],
            value: 7,
            ownerId: 'p0',
            groupCount: 2,
          },
        },
        null,
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const preview = processCasinoAction(
      s,
      { type: 'capture-preview', playedCard: { suit: 'hearts', rank: 7 }, capturedSlotIndices: [0] },
      'p0'
    ) as CasinoState;
    expect(preview.pendingCapturePreview).not.toBeNull();
    expect(preview.players[0].hand).toHaveLength(0);

    const finalized = processCasinoAction(preview, { type: 'finalize-capture' }, '') as CasinoState;
    expect(finalized.players[0].capturedCards).toHaveLength(5);
    expect(finalized.tableSlots[0]).toBeNull();
  });

  it('merges two builds into a D7 via group-table with build indices', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 7 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'clubs', rank: 3 }, { suit: 'diamonds', rank: 4 }],
            value: 7,
            ownerId: 'p0',
            groupCount: 1,
          },
        },
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'hearts', rank: 1 }, { suit: 'clubs', rank: 6 }],
            value: 7,
            ownerId: 'p1',
            groupCount: 1,
          },
        },
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const grouped = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [0, 1], declaredValue: 7 },
      'p0'
    ) as CasinoState;

    expect(grouped).not.toBe(s);
    const buildSlot = grouped.tableSlots[0];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.value).toBe(7);
      expect(buildSlot.build.groupCount).toBe(2);
      expect(buildSlot.build.ownerId).toBe('p0');
      expect(buildSlot.build.cards).toHaveLength(4);
    }
    expect(grouped.tableSlots[1]).toBeNull();
  });

  it('groups build 13 with loose king into D13', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 13 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'clubs', rank: 7 }, { suit: 'diamonds', rank: 6 }],
            value: 13,
            ownerId: 'p0',
            groupCount: 1,
          },
        },
        { kind: 'card', card: { suit: 'spades', rank: 13 } },
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const grouped = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [0, 1], declaredValue: 13 },
      'p0'
    ) as CasinoState;

    expect(grouped).not.toBe(s);
    const buildSlot = grouped.tableSlots[0];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.value).toBe(13);
      expect(buildSlot.build.groupCount).toBe(2);
      expect(buildSlot.build.cards).toHaveLength(3);
    }
    expect(grouped.tableSlots[1]).toBeNull();
  });

  it('rejects capture-preview of build 13 plus loose king before grouping', () => {
    const king: Card = { suit: 'hearts', rank: 13 };
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [king],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'clubs', rank: 7 }, { suit: 'diamonds', rank: 6 }],
            value: 13,
            ownerId: 'p0',
            groupCount: 1,
          },
        },
        { kind: 'card', card: { suit: 'spades', rank: 13 } },
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const preview = processCasinoAction(
      s,
      { type: 'capture-preview', playedCard: king, capturedSlotIndices: [0, 1] },
      'p0'
    );
    expect(preview).toBe(s);
  });

  it('triple build: D7 + loose cards summing to 7 → T7', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 7 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [
              { suit: 'clubs', rank: 3 }, { suit: 'diamonds', rank: 4 },
              { suit: 'hearts', rank: 1 }, { suit: 'clubs', rank: 6 },
            ],
            value: 7,
            ownerId: 'p0',
            groupCount: 2,
          },
        },
        { kind: 'card', card: { suit: 'spades', rank: 3 } },
        { kind: 'card', card: { suit: 'spades', rank: 4 } },
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const grouped = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [1, 2], declaredValue: 7 },
      'p0'
    ) as CasinoState;

    expect(grouped).not.toBe(s);
    const buildSlot = grouped.tableSlots[0];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.value).toBe(7);
      expect(buildSlot.build.groupCount).toBe(3);
      expect(buildSlot.build.cards).toHaveLength(6);
    }
  });

  it('rejects group-table when player owns a build of a different value', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [{ suit: 'hearts', rank: 9 }, { suit: 'hearts', rank: 6 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 8 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'clubs', rank: 4 }, { suit: 'diamonds', rank: 5 }],
            value: 9,
            ownerId: 'p0',
            groupCount: 1,
          },
        },
        { kind: 'card', card: { suit: 'clubs', rank: 3 } },
        { kind: 'card', card: { suit: 'hearts', rank: 3 } },
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [1, 2], declaredValue: 6 },
      'p0'
    );
    expect(next).toBe(s);
  });
});

describe('casino multi-card build with merge', () => {
  it('builds D15 from hand 3 + table 8,4 + existing build-15, then captures with 2♠', () => {
    const S2: Card = { suit: 'spades', rank: 2 };
    const H3: Card = { suit: 'hearts', rank: 3 };
    const C8: Card = { suit: 'clubs', rank: 8 };
    const D4: Card = { suit: 'diamonds', rank: 4 };
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [S2, H3],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 6 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'clubs', rank: 7 }, { suit: 'hearts', rank: 8 }],
            value: 15,
            ownerId: 'p1',
            groupCount: 1,
          },
        },
        { kind: 'card', card: C8 },
        { kind: 'card', card: D4 },
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const built = processCasinoAction(
      s,
      { type: 'build', playedCard: H3, tableCardIndices: [1, 2, 0], declaredValue: 15 },
      'p0'
    ) as CasinoState;

    expect(built).not.toBe(s);
    expect(built.players[0].hand).toHaveLength(1);
    expect(built.players[0].hand[0]).toEqual(S2);

    const buildSlot = built.tableSlots[1];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.value).toBe(15);
      expect(buildSlot.build.groupCount).toBe(2);
      expect(buildSlot.build.ownerId).toBe('p0');
    }
    expect(built.tableSlots[0]).toBeNull();
    expect(built.tableSlots[2]).toBeNull();
  });

  it('builds with multiple loose table cards without merging any build', () => {
    const H3: Card = { suit: 'hearts', rank: 3 };
    const C8: Card = { suit: 'clubs', rank: 8 };
    const D4: Card = { suit: 'diamonds', rank: 4 };
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [H3, { suit: 'spades', rank: 2 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 6 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        { kind: 'card', card: C8 },
        { kind: 'card', card: D4 },
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const built = processCasinoAction(
      s,
      { type: 'build', playedCard: H3, tableCardIndices: [0, 1], declaredValue: 15 },
      'p0'
    ) as CasinoState;

    expect(built).not.toBe(s);
    const buildSlot = built.tableSlots[0];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.value).toBe(15);
      expect(buildSlot.build.groupCount).toBe(1);
      expect(buildSlot.build.ownerId).toBe('p0');
    }
    expect(built.tableSlots[1]).toBeNull();
  });

  it('rejects build when selected builds have a different value than the declared sum', () => {
    const H3: Card = { suit: 'hearts', rank: 3 };
    const C8: Card = { suit: 'clubs', rank: 8 };
    const D4: Card = { suit: 'diamonds', rank: 4 };
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [H3, { suit: 'spades', rank: 2 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [{ suit: 'clubs', rank: 6 }],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: {
            cards: [{ suit: 'clubs', rank: 5 }, { suit: 'diamonds', rank: 5 }],
            value: 10,
            ownerId: 'p1',
            groupCount: 1,
          },
        },
        { kind: 'card', card: C8 },
        { kind: 'card', card: D4 },
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const result = processCasinoAction(
      s,
      { type: 'build', playedCard: H3, tableCardIndices: [1, 2, 0], declaredValue: 15 },
      'p0'
    );
    expect(result).toBe(s);
  });
});

describe('casino dealNumberInRound', () => {
  it('increments when redealing four cards mid scoring round', () => {
    const deckTail: Card[] = [
      { suit: 'clubs', rank: 1 },
      { suit: 'clubs', rank: 2 },
      { suit: 'clubs', rank: 3 },
      { suit: 'clubs', rank: 4 },
      { suit: 'clubs', rank: 5 },
      { suit: 'clubs', rank: 6 },
      { suit: 'clubs', rank: 7 },
      { suit: 'clubs', rank: 8 },
      { suit: 'clubs', rank: 9 },
      { suit: 'clubs', rank: 10 },
    ];
    const lastCard: Card = { suit: 'hearts', rank: 11 };
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [lastCard],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: deckTail,
      tableRows: 1,
      tableSlots: [null, null, null, null],
      currentPlayerIndex: 1,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: 0,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const afterTrail = processCasinoAction(
      s,
      { type: 'trail', playedCard: lastCard, targetSlotIndex: 0 },
      'p1'
    ) as CasinoState;

    expect(afterTrail.dealNumberInRound).toBe(2);
    expect(afterTrail.players[0].hand).toHaveLength(4);
    expect(afterTrail.players[1].hand).toHaveLength(4);
    expect(afterTrail.deck).toHaveLength(2);
    expect(afterTrail.currentPlayerIndex).toBe(1);
  });
});

describe('casino hand-assisted duplicate grouping', () => {
  const C3: Card = { suit: 'clubs', rank: 3 };
  const H3: Card = { suit: 'hearts', rank: 3 };
  const D3: Card = { suit: 'diamonds', rank: 3 };
  const S3: Card = { suit: 'spades', rank: 3 };
  const C8: Card = { suit: 'clubs', rank: 8 };

  it('groups loose 3 with played 3 into D3 and consumes the played card', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [C3, H3, { suit: 'clubs', rank: 4 }, { suit: 'clubs', rank: 5 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [C8],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [{ kind: 'card', card: S3 }, { kind: 'card', card: { suit: 'clubs', rank: 9 } }, null, null],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [0], declaredValue: 3, playedCard: C3 },
      'p0'
    ) as CasinoState;

    expect(next).not.toBe(s);
    expect(next.players[0].hand).toHaveLength(3);
    expect(next.players[0].hand).toContainEqual(H3);
    const buildSlot = next.tableSlots[0];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.value).toBe(3);
      expect(buildSlot.build.groupCount).toBe(2);
      expect(buildSlot.build.cards).toEqual([S3, C3]);
    }
  });

  it('groups D3 with a hand 3 into T3, then allows capture on next turn with remaining 3', () => {
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [C3, H3, { suit: 'clubs', rank: 4 }, { suit: 'clubs', rank: 5 }],
          capturedCards: [],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [C8],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [
        {
          kind: 'build',
          build: { cards: [S3, D3], value: 3, ownerId: 'p0', groupCount: 2 },
        },
        { kind: 'card', card: { suit: 'diamonds', rank: 9 } },
        null,
        null,
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const grouped = processCasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [0], declaredValue: 3, playedCard: C3 },
      'p0'
    ) as CasinoState;
    expect(grouped).not.toBe(s);
    const buildSlot = grouped.tableSlots[0];
    expect(buildSlot?.kind).toBe('build');
    if (buildSlot?.kind === 'build') {
      expect(buildSlot.build.groupCount).toBe(3);
      expect(buildSlot.build.cards).toEqual([S3, D3, C3]);
    }

    const p1Turn = processCasinoAction(
      grouped,
      { type: 'finish-action-announcement' },
      ''
    ) as CasinoState;
    const trailed = processCasinoAction(
      p1Turn,
      { type: 'trail', playedCard: C8, targetSlotIndex: 2 },
      'p1'
    ) as CasinoState;
    const p0Turn = processCasinoAction(
      trailed,
      { type: 'finish-action-announcement' },
      ''
    ) as CasinoState;

    const preview = processCasinoAction(
      p0Turn,
      { type: 'capture-preview', playedCard: H3, capturedSlotIndices: [0] },
      'p0'
    ) as CasinoState;
    expect(preview.pendingCapturePreview).not.toBeNull();
    expect(preview.players[0].hand).toHaveLength(2);

    const finalized = processCasinoAction(preview, { type: 'finalize-capture' }, '') as CasinoState;
    expect(finalized.tableSlots[0]).toBeNull();
    expect(finalized.players[0].capturedCards).toHaveLength(4);
  });
});

describe('casino table-remnant phase', () => {
  it('waits in table-remnant, then awards remaining table cards when finished', () => {
    const lastCard: Card = { suit: 'hearts', rank: 11 };
    const remainingTableCard: Card = { suit: 'clubs', rank: 9 };
    const s: CasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [],
          capturedCards: [{ suit: 'diamonds', rank: 10 }],
          sweepCount: 0,
        },
        {
          id: 'p1',
          name: 'B',
          color: 'blue',
          isBot: false,
          hand: [lastCard],
          capturedCards: [],
          sweepCount: 0,
        },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [{ kind: 'card', card: remainingTableCard }, null, null, null],
      currentPlayerIndex: 1,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: 0,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const afterLastPlay = processCasinoAction(
      s,
      { type: 'trail', playedCard: lastCard, targetSlotIndex: 1 },
      'p1'
    ) as CasinoState;

    expect(afterLastPlay.phase).toBe('table-remnant');
    expect(afterLastPlay.tableSlots[0]).toEqual({ kind: 'card', card: remainingTableCard });
    expect(afterLastPlay.tableSlots[1]).toEqual({ kind: 'card', card: lastCard });
    expect(afterLastPlay.players[0].capturedCards).toHaveLength(1);

    const afterRemnant = processCasinoAction(
      afterLastPlay,
      { type: 'finish-table-remnant' },
      ''
    ) as CasinoState;

    expect(afterRemnant.phase).toBe('round-end');
    expect(afterRemnant.tableSlots).toEqual([]);
    expect(afterRemnant.players[0].capturedCards).toEqual([
      { suit: 'diamonds', rank: 10 },
      remainingTableCard,
      lastCard,
    ]);
    expect(afterRemnant.lastRoundScores.p0).toBeDefined();
    expect(afterRemnant.lastRoundScores.p0.lastCapture).toBe(1);
    expect(afterRemnant.lastRoundScores.p0.total).toBe(
      afterRemnant.lastRoundScores.p0.mostCards +
        afterRemnant.lastRoundScores.p0.mostSpades +
        afterRemnant.lastRoundScores.p0.bigCasino +
        afterRemnant.lastRoundScores.p0.littleCasino +
        afterRemnant.lastRoundScores.p0.aces +
        afterRemnant.lastRoundScores.p0.sweeps +
        afterRemnant.lastRoundScores.p0.lastCapture
    );
    expect(afterRemnant.lastRoundScores.p1?.lastCapture ?? 0).toBe(0);
  });
});

describe('casino eachDealerOnce game end', () => {
  it('ends after one scoring round per player, not when a score target is met', () => {
    const tableRemnantState = (roundNumber: number): CasinoState => ({
      players: [
        { id: 'p0', name: 'A', color: 'red', isBot: false, hand: [], capturedCards: [], sweepCount: 0 },
        { id: 'p1', name: 'B', color: 'blue', isBot: false, hand: [], capturedCards: [], sweepCount: 0 },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'table-remnant',
      roundNumber,
      dealNumberInRound: 1,
      lastCapturerIndex: 0,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      matchLength: 'eachDealerOnce',
      targetScore: 0,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    });

    const afterRound1 = processCasinoAction(
      tableRemnantState(1),
      { type: 'finish-table-remnant' },
      ''
    ) as CasinoState;
    expect(afterRound1.phase).toBe('round-end');
    expect(afterRound1.gameOver).toBe(false);

    const afterRound2 = processCasinoAction(
      tableRemnantState(2),
      { type: 'finish-table-remnant' },
      ''
    ) as CasinoState;
    expect(afterRound2.phase).toBe('game-over');
    expect(afterRound2.gameOver).toBe(true);
  });
});

describe('runCasinoBotTurn', () => {
  it('does not advance from round-end', () => {
    const s: CasinoState = {
      players: [
        { id: 'p0', name: 'A', color: 'red', isBot: false, hand: [], capturedCards: [], sweepCount: 0 },
        { id: 'p1', name: 'B', color: 'blue', isBot: false, hand: [], capturedCards: [], sweepCount: 0 },
      ],
      deck: [],
      tableRows: 1,
      tableSlots: [],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'round-end',
      roundNumber: 1,
      dealNumberInRound: 1,
      lastCapturerIndex: -1,
      scores: { p0: 3, p1: 2 },
      lastRoundScores: {
        p0: {
          mostCards: 3,
          mostSpades: 0,
          bigCasino: 0,
          littleCasino: 0,
          aces: 0,
          sweeps: 0,
          lastCapture: 0,
          total: 3,
        },
        p1: {
          mostCards: 0,
          mostSpades: 0,
          bigCasino: 0,
          littleCasino: 0,
          aces: 0,
          sweeps: 0,
          lastCapture: 0,
          total: 0,
        },
      },
      matchLength: 'to21',
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };
    expect(runCasinoBotTurn(s)).toBe(s);
  });
});
