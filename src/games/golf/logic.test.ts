import { describe, expect, it } from 'vitest';
import type { Card, GolfPlayer, Rank, TableSlot } from './types';
import { TABLE_SLOT_COUNT, TOTAL_HOLES } from './types';
import {
  buildInitialTable,
  cardEquals,
  createGolfState,
  createGolfStateForTest,
  finishGame,
  processGolfAction,
  scorePlayerTable,
  slotPointValue,
  startHole,
} from './logic';
import { cardPointValue, scorePlayerTable as rulesScore } from './rules';

function card(rank: Rank, suit: Card['suit'] = 'hearts'): Card {
  return { rank, suit };
}

function rankFromOffset(base: Rank, offset: number): Rank {
  return (base + offset) as Rank;
}

function slot(c: Card, faceUp = true): TableSlot {
  return { card: c, faceUp };
}

function makePlayer(id: string, table: TableSlot[], totalScore = 0): GolfPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: false,
    table,
    totalScore,
  };
}

describe('createGolfState', () => {
  it('deals six table cards with bottom row face up and starts discard', () => {
    const state = createGolfState([
      { id: 'p1', name: 'Alice', color: 'blue', isBot: false, isHost: true, connected: true },
      { id: 'p2', name: 'Bob', color: 'red', isBot: false, isHost: false, connected: true },
    ]);

    expect(state.holeNumber).toBe(1);
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(2);
    for (const player of state.players) {
      expect(player.table).toHaveLength(TABLE_SLOT_COUNT);
      expect(player.table.slice(0, 3).every(s => !s.faceUp)).toBe(true);
      expect(player.table.slice(3).every(s => s.faceUp)).toBe(true);
    }
    expect(state.discard).toHaveLength(1);
    expect(state.stock.length).toBeGreaterThan(0);
  });
});

describe('processGolfAction', () => {
  it('rejects swap when no pending draw', () => {
    const players = [
      makePlayer('p1', [slot(card(2)), slot(card(3)), slot(card(4)), slot(card(5)), slot(card(6)), slot(card(7))]),
    ];
    const state = createGolfStateForTest(players, 1);
    const next = processGolfAction(state, { type: 'swap-with-slot', slotIndex: 0 }, 'p1');
    expect(next).toBe(state);
  });

  it('allows stock draw then discard drawn card', () => {
    const players = [makePlayer('p1', Array.from({ length: 6 }, (_, i) => slot(card(rankFromOffset(2, i)))))];
    const state = createGolfStateForTest(players, 1, {
      stock: [card(10, 'spades')],
      discard: [card(4, 'clubs')],
    });

    const drawn = processGolfAction(state, { type: 'draw-from-stock' }, 'p1') as typeof state;
    expect(drawn.pendingDraw).toEqual(card(10, 'spades'));
    expect(drawn.pendingDrawSource).toBe('stock');

    const afterDiscard = processGolfAction(drawn, { type: 'discard-drawn' }, 'p1') as typeof state;
    expect(afterDiscard.pendingDraw).toBeNull();
    expect(afterDiscard.discard.at(-1)).toEqual(card(10, 'spades'));
    expect(afterDiscard.currentPlayerIndex).toBe(0);
  });

  it('requires swap after taking discard', () => {
    const players = [makePlayer('p1', Array.from({ length: 6 }, (_, i) => slot(card(rankFromOffset(2, i)))))];
    const state = createGolfStateForTest(players, 1, {
      stock: [card(9, 'diamonds')],
      discard: [card(5, 'clubs'), card(8, 'spades')],
    });

    const taken = processGolfAction(state, { type: 'take-discard' }, 'p1') as typeof state;
    expect(taken.pendingDraw).toEqual(card(8, 'spades'));

    const rejected = processGolfAction(taken, { type: 'discard-drawn' }, 'p1');
    expect(rejected).toBe(taken);

    const swapped = processGolfAction(taken, { type: 'swap-with-slot', slotIndex: 0 }, 'p1') as typeof state;
    expect(swapped.pendingDraw).toBeNull();
    expect(swapped.players[0].table[0].card).toEqual(card(8, 'spades'));
    expect(swapped.discard.at(-1)).toEqual(card(2));
  });

  it('rejects actions from wrong player', () => {
    const players = [
      makePlayer('p1', Array.from({ length: 6 }, () => slot(card(5)))),
      makePlayer('p2', Array.from({ length: 6 }, () => slot(card(6)))),
    ];
    const state = createGolfStateForTest(players, 1, { stock: [card(9)] });
    const next = processGolfAction(state, { type: 'draw-from-stock' }, 'p2');
    expect(next).toBe(state);
  });
});

describe('scoring', () => {
  it('scores ranks correctly', () => {
    expect(cardPointValue(card(14))).toBe(1);
    expect(cardPointValue(card(10))).toBe(10);
    expect(cardPointValue(card(11))).toBe(10);
    expect(cardPointValue(card(13))).toBe(0);
  });

  it('cancels matching ranks in the same column', () => {
    const table = [
      slot(card(7, 'hearts')),
      slot(card(3, 'clubs')),
      slot(card(9, 'diamonds')),
      slot(card(7, 'spades')),
      slot(card(4, 'hearts')),
      slot(card(2, 'clubs')),
    ];
    expect(slotPointValue(table, 0)).toBe(0);
    expect(slotPointValue(table, 3)).toBe(0);
    expect(rulesScore(makePlayer('p1', table))).toBe(3 + 9 + 4 + 2);
  });
});

describe('hole end', () => {
  it('enters hole-end after final turns when someone goes all face up', () => {
    const faceUpTable = Array.from({ length: 6 }, (_, i) => slot(card(rankFromOffset(2, i)), true));
    const hiddenTable = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [makePlayer('p1', faceUpTable), makePlayer('p2', hiddenTable)];
    const state = createGolfStateForTest(players, 1, {
      stock: [card(9)],
      discard: [card(4, 'clubs')],
      currentPlayerIndex: 1,
      pendingDraw: card(9, 'diamonds'),
      pendingDrawSource: 'stock',
      endingRound: true,
      finalTurnsLeft: 0,
    });

    const afterFinalTurn = processGolfAction(state, { type: 'discard-drawn' }, 'p2') as typeof state;
    expect(afterFinalTurn.phase).toBe('hole-end');
    expect(afterFinalTurn.holeScores.p1).toBe(scorePlayerTable(players[0]));
    expect(afterFinalTurn.players[0].totalScore).toBeGreaterThan(0);
  });

  it('finishes game after hole 9', () => {
    const players = [
      makePlayer('p1', Array.from({ length: 6 }, () => slot(card(2))), 10),
      makePlayer('p2', Array.from({ length: 6 }, () => slot(card(3))), 15),
    ];
    const state = createGolfStateForTest(players, TOTAL_HOLES, { phase: 'hole-end' });
    const next = processGolfAction(state, { type: 'start-next-hole' }, '') as typeof state;
    expect(next.phase).toBe('game-over');
    expect(next.winners).toEqual(['p1']);
  });
});

describe('cardEquals', () => {
  it('matches suit and rank', () => {
    expect(cardEquals(card(7, 'hearts'), card(7, 'hearts'))).toBe(true);
    expect(cardEquals(card(7, 'hearts'), card(7, 'spades'))).toBe(false);
  });
});

describe('startHole', () => {
  it('uses double deck for six players', () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`p${i}`, [], 0),
    );
    const state = startHole(players, 1);
    const dealt = 6 * 6 + state.stock.length + state.discard.length;
    expect(dealt).toBe(104);
  });
});

describe('finishGame', () => {
  it('picks lowest total score winners', () => {
    const players = [makePlayer('p1', [], 20), makePlayer('p2', [], 12), makePlayer('p3', [], 12)];
    const state = finishGame(players);
    expect(state.winners.sort()).toEqual(['p2', 'p3']);
  });
});
