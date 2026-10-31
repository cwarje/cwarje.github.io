import { describe, expect, it } from 'vitest';
import type { CasinoState, Card } from './types';
import {
  buildCaptureSlotFlights,
  detectCasinoPlayAnimIntent,
  findBuildTargetSlot,
  findTrailTargetSlot,
} from './casinoPlayAnimDetect';

function baseState(overrides: Partial<CasinoState> = {}): CasinoState {
  return {
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
    scores: { p0: 0 },
    lastRoundScores: {},
    matchLength: 'to21',
    targetScore: 21,
    gameOver: false,
    winners: [],
    actionAnnouncement: null,
    pendingCapturePreview: null,
    ...overrides,
  };
}

const H9: Card = { suit: 'hearts', rank: 9 };
const C5: Card = { suit: 'clubs', rank: 5 };
const D10: Card = { suit: 'diamonds', rank: 10 };

describe('findTrailTargetSlot', () => {
  it('finds empty slot that received the trailed card', () => {
    const prev = [null, null, null, null];
    const next = [{ kind: 'card' as const, card: H9 }, null, null, null];
    expect(findTrailTargetSlot(prev, next, H9)).toBe(0);
  });
});

describe('findBuildTargetSlot', () => {
  it('finds slot that became a build containing the played card', () => {
    const prev = [{ kind: 'card' as const, card: C5 }, null, null, null];
    const next = [
      {
        kind: 'build' as const,
        build: { cards: [H9, C5], value: 14, ownerId: 'p0', groupCount: 1 },
      },
      null,
      null,
      null,
    ];
    expect(findBuildTargetSlot(prev, next, H9)).toBe(0);
  });
});

describe('buildCaptureSlotFlights', () => {
  it('marks played card as from hand when not on captured slots', () => {
    const prev = [{ kind: 'card' as const, card: C5 }, null, null, null];
    const played: Card = { suit: 'spades', rank: 2 };
    const captured = [played, C5];
    const { playedFromHand, slotFlights } = buildCaptureSlotFlights(prev, [0], played, captured);
    expect(playedFromHand).toEqual(played);
    expect(slotFlights).toEqual([{ slotIndex: 0, cards: [C5] }]);
  });
});

describe('detectCasinoPlayAnimIntent', () => {
  it('detects capture preview play', () => {
    const prev = baseState();
    const next = baseState({
      players: [{ ...prev.players[0]!, hand: [] }],
      pendingCapturePreview: {
        playerId: 'p0',
        playedCard: H9,
        capturedSlotIndices: [1],
      },
    });
    const intent = detectCasinoPlayAnimIntent(prev, next);
    expect(intent?.kind).toBe('capture-preview-play');
  });

  it('detects trail announcement hand-to-table', () => {
    const prev = baseState({
      players: [{ ...baseState().players[0]!, hand: [] }],
      tableSlots: [null, null, null, null],
    });
    const next = baseState({
      phase: 'announcement',
      players: [{ ...prev.players[0]!, hand: [] }],
      tableSlots: [{ kind: 'card', card: H9 }, null, null, null],
      actionAnnouncement: { kind: 'trail', playerId: 'p0', playedCard: H9 },
      currentPlayerIndex: 0,
    });
    next.currentPlayerIndex = 0;
    const intent = detectCasinoPlayAnimIntent(prev, next);
    expect(intent).toEqual({
      kind: 'announcement-hand-to-table',
      playerId: 'p0',
      playedCard: H9,
      targetSlotIndex: 0,
      announcementKind: 'trail',
    });
  });

  it('detects table-only group', () => {
    const prev = baseState({
      tableSlots: [
        { kind: 'card', card: C5 },
        { kind: 'card', card: D10 },
        null,
        null,
      ],
    });
    const next = baseState({
      tableSlots: [
        {
          kind: 'build',
          build: { cards: [C5, D10], value: 15, ownerId: 'p0', groupCount: 1 },
        },
        null,
        null,
        null,
      ],
    });
    const intent = detectCasinoPlayAnimIntent(prev, next);
    expect(intent?.kind).toBe('table-only-group');
    if (intent?.kind === 'table-only-group') {
      expect(intent.targetSlotIndex).toBe(0);
      expect(intent.sourceFlights.length).toBe(2);
    }
  });

  it('detects capture finalize to seat', () => {
    const prev = baseState({
      tableSlots: [{ kind: 'card', card: C5 }, null, null, null],
      pendingCapturePreview: {
        playerId: 'p0',
        playedCard: H9,
        capturedSlotIndices: [0],
      },
      players: [{ ...baseState().players[0]!, hand: [] }],
    });
    const next = baseState({
      phase: 'announcement',
      tableSlots: [null, null, null, null],
      actionAnnouncement: {
        kind: 'capture',
        playerId: 'p0',
        capturedCards: [H9, C5],
        sweep: false,
        capturedBuild: false,
      },
      players: [{ ...prev.players[0]!, capturedCards: [H9, C5], hand: [] }],
    });
    const intent = detectCasinoPlayAnimIntent(prev, next);
    expect(intent?.kind).toBe('capture-to-seat');
    if (intent?.kind === 'capture-to-seat') {
      expect(intent.playedFromHand).toBeNull();
      expect(intent.playedFromPreview).toEqual({
        card: H9,
        slotIndices: [0],
      });
    }
  });
});
