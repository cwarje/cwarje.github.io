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
    const tableLenBefore = s.tableItems.length;
    const handLenBefore = s.players[idx].hand.length;

    const next = processByggkasinoAction(s, { type: 'trail', playedCard: card }, pid) as ByggkasinoState;

    expect(next).not.toBe(s);
    expect(next.phase).toBe('announcement');
    expect(next.actionAnnouncement).toEqual({
      kind: 'trail',
      playerId: pid,
      playedCard: card,
    });
    expect(next.players[idx].hand).toHaveLength(handLenBefore - 1);
    expect(next.players[idx].hand.some(c => c.suit === card.suit && c.rank === card.rank)).toBe(false);
    expect(next.tableItems).toHaveLength(tableLenBefore + 1);
    const last = next.tableItems[next.tableItems.length - 1];
    expect(last).toEqual({ kind: 'card', card });

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
      tableItems: [
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
    };

    const next = processByggkasinoAction(s, { type: 'trail', playedCard: { suit: 'hearts', rank: 9 } }, 'p0');
    expect(next).toBe(s);
  });
});
