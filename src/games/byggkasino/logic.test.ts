import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import { createByggkasinoState, processByggkasinoAction } from './logic';
import type { ByggkasinoState } from './types';

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

describe('byggkasino trail', () => {
  it('playedCard removes card from hand and adds it to the table', () => {
    const s = createByggkasinoState([makePlayer('p0', 'A'), makePlayer('p1', 'B')]) as ByggkasinoState;
    const idx = s.currentPlayerIndex;
    const pid = s.players[idx].id;
    const card = s.players[idx].hand[0];
    const tableLenBefore = s.tableSlots.filter(Boolean).length;
    const handLenBefore = s.players[idx].hand.length;
    const firstOpen = s.tableSlots.findIndex(slot => slot == null);
    const targetSlotIndex = firstOpen >= 0 ? firstOpen : s.tableRows * 4;

    const next = processByggkasinoAction(
      s,
      { type: 'trail', playedCard: card, targetSlotIndex },
      pid
    ) as ByggkasinoState;

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

    const afterHud = processByggkasinoAction(next, { type: 'finish-action-announcement' }, '') as ByggkasinoState;
    expect(afterHud.phase).toBe('playing');
    expect(afterHud.actionAnnouncement).toBeNull();
  });

  it('rejects trail when current player owns a build on the table', () => {
    const s: ByggkasinoState = {
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
          },
        },
      ],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      phase: 'playing',
      roundNumber: 1,
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const next = processByggkasinoAction(
      s,
      { type: 'trail', playedCard: { suit: 'hearts', rank: 9 }, targetSlotIndex: 1 },
      'p0'
    );
    expect(next).toBe(s);
  });
});

describe('byggkasino group-table then capture', () => {
  it('groups loose cards without advancing turn, then capture finalizes', () => {
    const six: Card = { suit: 'diamonds', rank: 6 };
    const s: ByggkasinoState = {
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
      lastCapturerIndex: -1,
      scores: { p0: 0, p1: 0 },
      lastRoundScores: {},
      targetScore: 21,
      gameOver: false,
      winners: [],
      actionAnnouncement: null,
      pendingCapturePreview: null,
    };

    const grouped = processByggkasinoAction(
      s,
      { type: 'group-table', tableCardIndices: [0, 1], declaredValue: 6 },
      'p0'
    ) as ByggkasinoState;

    expect(grouped).not.toBe(s);
    expect(grouped.currentPlayerIndex).toBe(0);
    expect(grouped.phase).toBe('playing');
    expect(grouped.players[0].hand).toHaveLength(1);
    expect(grouped.tableSlots[0]?.kind).toBe('build');
    expect(grouped.tableSlots[1]).toBeNull();

    const preview = processByggkasinoAction(
      grouped,
      { type: 'capture-preview', playedCard: six, capturedSlotIndices: [0] },
      'p0'
    ) as ByggkasinoState;
    expect(preview.pendingCapturePreview).not.toBeNull();

    const finalized = processByggkasinoAction(preview, { type: 'finalize-capture' }, '') as ByggkasinoState;
    expect(finalized.pendingCapturePreview).toBeNull();
    expect(finalized.phase).toBe('announcement');
    expect(finalized.players[0].hand).toHaveLength(0);
    expect(finalized.players[0].capturedCards).toHaveLength(3);
  });
});
