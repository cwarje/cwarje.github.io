import { describe, expect, it } from 'vitest';
import type { Card, GolfPlayer, Rank, TableSlot } from './types';
import { TABLE_SLOT_COUNT, TOTAL_HOLES } from './types';
import {
  buildInitialTable,
  cardEquals,
  createGolfState,
  createGolfStateForTest,
  endHole,
  finishGame,
  isGolfOver,
  processGolfAction,
  scorePlayerTable,
  slotPointValue,
  startHole,
} from './logic';
import { cardPointValue, columnPairScore, estimatedSlotValue, scorePlayerTable as rulesScore, scorePlayerTableEstimated, squareBonus } from './rules';

function card(rank: Rank, suit: Card['suit'] = 'hearts'): Card {
  return { rank, suit };
}

function rankFromOffset(base: Rank, offset: number): Rank {
  return (base + offset) as Rank;
}

function slot(c: Card, faceUp = true): TableSlot {
  return { card: c, faceUp };
}

function makePlayer(id: string, table: TableSlot[], totalScore = 0, setupFlipsRemaining = 0): GolfPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: false,
    table,
    setupFlipsRemaining,
    totalScore,
  };
}

describe('createGolfState', () => {
  it('deals six face-down table cards and starts setup phase', () => {
    const state = createGolfState([
      { id: 'p1', name: 'Alice', color: 'blue', isBot: false, isHost: true, connected: true },
      { id: 'p2', name: 'Bob', color: 'red', isBot: false, isHost: false, connected: true },
    ]);

    expect(state.holeNumber).toBe(1);
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(2);
    for (const player of state.players) {
      expect(player.table).toHaveLength(TABLE_SLOT_COUNT);
      expect(player.table.every(s => !s.faceUp)).toBe(true);
      expect(player.setupFlipsRemaining).toBe(2);
    }
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.startingPlayerIndex).toBe(0);
    expect(state.discard).toHaveLength(1);
    expect(state.stock.length).toBeGreaterThan(0);
  });
});

describe('setup phase', () => {
  it('flips a face-down slot and decrements setup counter', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [
      makePlayer('p1', table, 0, 2),
      makePlayer('p2', buildInitialTable([card(8), card(9), card(10), card(11), card(12), card(13)]), 0, 2),
    ];
    const state = createGolfStateForTest(players, 1);

    const afterFlip = processGolfAction(state, { type: 'flip-table-slot', slotIndex: 0 }, 'p1') as typeof state;
    expect(afterFlip.players[0].table[0].faceUp).toBe(true);
    expect(afterFlip.players[0].setupFlipsRemaining).toBe(1);
    expect(afterFlip.currentPlayerIndex).toBe(0);
  });

  it('advances to next player after second setup flip', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [
      makePlayer('p1', table, 0, 1),
      makePlayer('p2', buildInitialTable([card(8), card(9), card(10), card(11), card(12), card(13)]), 0, 2),
    ];
    const state = createGolfStateForTest(players, 1);

    const afterFlip = processGolfAction(state, { type: 'flip-table-slot', slotIndex: 1 }, 'p1') as typeof state;
    expect(afterFlip.players[0].setupFlipsRemaining).toBe(0);
    expect(afterFlip.currentPlayerIndex).toBe(1);
    expect(afterFlip.players[1].setupFlipsRemaining).toBe(2);
  });

  it('starts normal play at player 0 after all setup flips', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [
      makePlayer('p1', table, 0, 0),
      makePlayer('p2', buildInitialTable([card(8), card(9), card(10), card(11), card(12), card(13)]), 0, 1),
    ];
    const state = createGolfStateForTest(players, 1, {
      currentPlayerIndex: 1,
      stock: [card(10, 'spades')],
      discard: [card(4, 'clubs')],
    });

    const afterFlip = processGolfAction(state, { type: 'flip-table-slot', slotIndex: 0 }, 'p2') as typeof state;
    expect(afterFlip.players.every(player => player.setupFlipsRemaining === 0)).toBe(true);
    expect(afterFlip.currentPlayerIndex).toBe(0);

    const drawn = processGolfAction(afterFlip, { type: 'draw-from-stock' }, 'p1') as typeof state;
    expect(drawn.pendingDraw).toEqual(card(10, 'spades'));
  });

  it('starts normal play at starting player after all setup flips when starter is not player 0', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [
      makePlayer('p1', table, 0, 0),
      makePlayer('p2', buildInitialTable([card(8), card(9), card(10), card(11), card(12), card(13)]), 0, 1),
    ];
    const state = createGolfStateForTest(players, 1, {
      currentPlayerIndex: 1,
      startingPlayerIndex: 1,
      stock: [card(10, 'spades')],
      discard: [card(4, 'clubs')],
    });

    const afterFlip = processGolfAction(state, { type: 'flip-table-slot', slotIndex: 0 }, 'p2') as typeof state;
    expect(afterFlip.players.every(player => player.setupFlipsRemaining === 0)).toBe(true);
    expect(afterFlip.currentPlayerIndex).toBe(1);

    const drawn = processGolfAction(afterFlip, { type: 'draw-from-stock' }, 'p2') as typeof state;
    expect(drawn.pendingDraw).toEqual(card(10, 'spades'));
  });

  it('rejects draw during setup phase', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [makePlayer('p1', table, 0, 2)];
    const state = createGolfStateForTest(players, 1, { stock: [card(9)] });

    const rejected = processGolfAction(state, { type: 'draw-from-stock' }, 'p1');
    expect(rejected).toBe(state);
  });

  it('rejects flip on face-up slot during setup phase', () => {
    const table = [
      slot(card(2), true),
      slot(card(3), false),
      slot(card(4), false),
      slot(card(5), false),
      slot(card(6), false),
      slot(card(7), false),
    ];
    const players = [makePlayer('p1', table, 0, 1)];
    const state = createGolfStateForTest(players, 1);

    const rejected = processGolfAction(state, { type: 'flip-table-slot', slotIndex: 0 }, 'p1');
    expect(rejected).toBe(state);
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
    expect(afterDiscard.pendingOptionalFlip).toBe(false);
    expect(afterDiscard.discard.at(-1)).toEqual(card(10, 'spades'));
    expect(afterDiscard.currentPlayerIndex).toBe(0);
  });

  it('enters optional flip phase after stock discard when face-down slots remain', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [makePlayer('p1', table), makePlayer('p2', Array.from({ length: 6 }, (_, i) => slot(card(rankFromOffset(2, i)))))];
    const state = createGolfStateForTest(players, 1, {
      stock: [card(10, 'spades')],
      discard: [card(4, 'clubs')],
    });

    const drawn = processGolfAction(state, { type: 'draw-from-stock' }, 'p1') as typeof state;
    const afterDiscard = processGolfAction(drawn, { type: 'discard-drawn' }, 'p1') as typeof state;
    expect(afterDiscard.pendingOptionalFlip).toBe(true);
    expect(afterDiscard.currentPlayerIndex).toBe(0);
    expect(afterDiscard.pendingDraw).toBeNull();
  });

  it('flips a face-down slot during optional flip phase', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [makePlayer('p1', table), makePlayer('p2', Array.from({ length: 6 }, (_, i) => slot(card(rankFromOffset(2, i)))))];
    const state = createGolfStateForTest(players, 1, {
      pendingOptionalFlip: true,
      discard: [card(10, 'spades')],
    });

    const afterFlip = processGolfAction(state, { type: 'flip-table-slot', slotIndex: 1 }, 'p1') as typeof state;
    expect(afterFlip.pendingOptionalFlip).toBe(false);
    expect(afterFlip.players[0].table[1].faceUp).toBe(true);
    expect(afterFlip.players[0].table[1].card).toEqual(card(3));
    expect(afterFlip.currentPlayerIndex).toBe(1);
  });

  it('skips optional flip and advances turn', () => {
    const table = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const players = [makePlayer('p1', table), makePlayer('p2', Array.from({ length: 6 }, (_, i) => slot(card(rankFromOffset(2, i)))))];
    const state = createGolfStateForTest(players, 1, {
      pendingOptionalFlip: true,
      discard: [card(10, 'spades')],
    });

    const afterSkip = processGolfAction(state, { type: 'skip-optional-flip' }, 'p1') as typeof state;
    expect(afterSkip.pendingOptionalFlip).toBe(false);
    expect(afterSkip.currentPlayerIndex).toBe(1);
  });

  it('rejects flip on face-up slot during optional flip phase', () => {
    const table = [
      slot(card(2), false),
      slot(card(3), false),
      slot(card(4), false),
      slot(card(5), true),
      slot(card(6), false),
      slot(card(7), false),
    ];
    const players = [makePlayer('p1', table)];
    const state = createGolfStateForTest(players, 1, { pendingOptionalFlip: true });

    const rejected = processGolfAction(state, { type: 'flip-table-slot', slotIndex: 3 }, 'p1');
    expect(rejected).toBe(state);
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
    expect(cardPointValue(card(2))).toBe(-2);
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
    expect(columnPairScore(table, 0)).toBe(0);
    expect(columnPairScore(table, 1)).toBe(7);
    expect(rulesScore(makePlayer('p1', table))).toBe(14);
  });

  it('cancels matching 2s in the same column', () => {
    const table = [
      slot(card(2, 'hearts')),
      slot(card(3, 'clubs')),
      slot(card(9, 'diamonds')),
      slot(card(2, 'spades')),
      slot(card(4, 'hearts')),
      slot(card(5, 'clubs')),
    ];
    expect(slotPointValue(table, 0)).toBe(0);
    expect(slotPointValue(table, 3)).toBe(0);
    expect(columnPairScore(table, 0)).toBe(0);
    expect(rulesScore(makePlayer('p1', table))).toBe(3 + 9 + 4 + 5);
  });

  it('applies -20 for a left 2x2 square of the same rank', () => {
    const table = [
      slot(card(8, 'hearts')),
      slot(card(8, 'clubs')),
      slot(card(9, 'diamonds')),
      slot(card(8, 'spades')),
      slot(card(8, 'diamonds')),
      slot(card(2, 'clubs')),
    ];
    expect(squareBonus(table)).toBe(-20);
    expect(rulesScore(makePlayer('p1', table))).toBe(-13);
  });

  it('applies -20 for a right 2x2 square of the same rank', () => {
    const table = [
      slot(card(9, 'hearts')),
      slot(card(5, 'clubs')),
      slot(card(5, 'diamonds')),
      slot(card(2, 'spades')),
      slot(card(5, 'hearts')),
      slot(card(5, 'spades')),
    ];
    expect(squareBonus(table)).toBe(-20);
    expect(rulesScore(makePlayer('p1', table))).toBe(-13);
  });

  it('applies -40 when all six cards share the same rank', () => {
    const table = [
      slot(card(7, 'hearts')),
      slot(card(7, 'clubs')),
      slot(card(7, 'diamonds')),
      slot(card(7, 'spades')),
      slot(card(7, 'hearts')),
      slot(card(7, 'clubs')),
    ];
    expect(squareBonus(table)).toBe(-40);
    expect(rulesScore(makePlayer('p1', table))).toBe(-40);
  });

  it('does not apply a bonus when four matching cards do not form a 2x2', () => {
    const table = [
      slot(card(7, 'hearts')),
      slot(card(7, 'clubs')),
      slot(card(9, 'diamonds')),
      slot(card(7, 'spades')),
      slot(card(3, 'hearts')),
      slot(card(2, 'clubs')),
    ];
    expect(squareBonus(table)).toBe(0);
    expect(rulesScore(makePlayer('p1', table))).toBe(17);
  });

  it('does not apply a bonus for mixed ranks in a 2x2 region', () => {
    const table = [
      slot(card(8, 'hearts')),
      slot(card(7, 'clubs')),
      slot(card(9, 'diamonds')),
      slot(card(8, 'spades')),
      slot(card(7, 'hearts')),
      slot(card(2, 'clubs')),
    ];
    expect(squareBonus(table)).toBe(0);
    expect(rulesScore(makePlayer('p1', table))).toBe(7);
  });
});

describe('scorePlayerTableEstimated', () => {
  it('counts hidden slots as 7 regardless of actual rank', () => {
    const table = [
      slot(card(13, 'hearts'), false),
      slot(card(3), true),
      slot(card(4), true),
      slot(card(5), true),
      slot(card(6), true),
      slot(card(7), true),
    ];
    expect(scorePlayerTableEstimated(makePlayer('p1', table))).toBe(7 + 3 + 4 + 5 + 6 + 7);
  });

  it('does not cancel column pairs when the partner card is hidden', () => {
    const table = [
      slot(card(7, 'hearts'), false),
      slot(card(3), true),
      slot(card(9), true),
      slot(card(7, 'spades'), true),
      slot(card(4), true),
      slot(card(2), true),
    ];
    expect(estimatedSlotValue(table, 0)).toBe(7);
    expect(estimatedSlotValue(table, 3)).toBe(7);
    expect(scorePlayerTableEstimated(makePlayer('p1', table))).toBe(28);
  });

  it('cancels column pairs once both cards are face up', () => {
    const table = [
      slot(card(7, 'hearts'), true),
      slot(card(3), true),
      slot(card(9), true),
      slot(card(7, 'spades'), true),
      slot(card(4), true),
      slot(card(2), true),
    ];
    expect(estimatedSlotValue(table, 0)).toBe(0);
    expect(estimatedSlotValue(table, 3)).toBe(0);
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

    const afterDiscard = processGolfAction(state, { type: 'discard-drawn' }, 'p2') as typeof state;
    expect(afterDiscard.pendingOptionalFlip).toBe(true);

    const afterFinalTurn = processGolfAction(afterDiscard, { type: 'skip-optional-flip' }, 'p2') as typeof state;
    expect(afterFinalTurn.phase).toBe('hole-end');
    expect(afterFinalTurn.holeScores.p1).toBe(scorePlayerTable(players[0]));
    expect(afterFinalTurn.players[0].totalScore).toBeGreaterThan(0);
    expect(afterFinalTurn.players.every(p => p.table.every(slot => slot.faceUp))).toBe(true);
  });

  it('enters hole-end with gameOver on hole 9 before final screen', () => {
    const hiddenTable = buildInitialTable([
      card(2),
      card(3),
      card(4),
      card(5),
      card(6),
      card(7),
    ]);
    const faceUpTable = [
      slot(card(2), true),
      slot(card(3), false),
      slot(card(4), true),
      slot(card(5), false),
      slot(card(6), true),
      slot(card(7), false),
    ];
    const players = [
      makePlayer('p1', hiddenTable, 10),
      makePlayer('p2', faceUpTable, 15),
    ];
    const state = createGolfStateForTest(players, TOTAL_HOLES, { phase: 'playing' });
    const afterHole = endHole(state) as typeof state;

    expect(afterHole.phase).toBe('hole-end');
    expect(afterHole.gameOver).toBe(true);
    expect(afterHole.winners).toEqual(['p1']);
    expect(isGolfOver(afterHole)).toBe(false);
    expect(afterHole.players.every(p => p.table.every(slot => slot.faceUp))).toBe(true);
    expect(afterHole.holeEndFlipSlotIds).toEqual([
      'p1-slot-0',
      'p1-slot-1',
      'p1-slot-2',
      'p1-slot-3',
      'p1-slot-4',
      'p1-slot-5',
      'p2-slot-1',
      'p2-slot-3',
      'p2-slot-5',
    ]);
  });

  it('shows final results after hole 9 score phase', () => {
    const players = [
      makePlayer('p1', Array.from({ length: 6 }, () => slot(card(2))), 10),
      makePlayer('p2', Array.from({ length: 6 }, () => slot(card(3))), 15),
    ];
    const state = createGolfStateForTest(players, TOTAL_HOLES, {
      phase: 'hole-end',
      gameOver: true,
      winners: ['p1'],
    });
    const unchanged = processGolfAction(state, { type: 'start-next-hole' }, '') as typeof state;
    expect(unchanged).toBe(state);

    const next = processGolfAction(state, { type: 'show-final-results' }, '') as typeof state;
    expect(next.phase).toBe('game-over');
    expect(next.winners).toEqual(['p1']);
    expect(isGolfOver(next)).toBe(true);
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

  it('starts at the given starting player index', () => {
    const players = [
      makePlayer('p1', [], 0),
      makePlayer('p2', [], 0),
      makePlayer('p3', [], 0),
    ];
    const state = startHole(players, 2, 1);
    expect(state.startingPlayerIndex).toBe(1);
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.holeNumber).toBe(2);
  });
});

describe('starting player rotation', () => {
  it('rotates starting player on start-next-hole', () => {
    const players = [
      makePlayer('p1', Array.from({ length: 6 }, () => slot(card(2))), 5),
      makePlayer('p2', Array.from({ length: 6 }, () => slot(card(3))), 8),
      makePlayer('p3', Array.from({ length: 6 }, () => slot(card(4))), 12),
    ];
    const state = createGolfStateForTest(players, 1, {
      phase: 'hole-end',
      startingPlayerIndex: 0,
    });

    const next = processGolfAction(state, { type: 'start-next-hole' }, '') as typeof state;
    expect(next.holeNumber).toBe(2);
    expect(next.startingPlayerIndex).toBe(1);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe('playing');
    expect(next.players.every(player => player.setupFlipsRemaining === 2)).toBe(true);
  });

  it('wraps starting player index after the last seat', () => {
    const players = [
      makePlayer('p1', Array.from({ length: 6 }, () => slot(card(2))), 5),
      makePlayer('p2', Array.from({ length: 6 }, () => slot(card(3))), 8),
      makePlayer('p3', Array.from({ length: 6 }, () => slot(card(4))), 12),
    ];
    const state = createGolfStateForTest(players, 3, {
      phase: 'hole-end',
      startingPlayerIndex: 2,
    });

    const next = processGolfAction(state, { type: 'start-next-hole' }, '') as typeof state;
    expect(next.holeNumber).toBe(4);
    expect(next.startingPlayerIndex).toBe(0);
    expect(next.currentPlayerIndex).toBe(0);
  });
});

describe('finishGame', () => {
  it('picks lowest total score winners', () => {
    const players = [makePlayer('p1', [], 20), makePlayer('p2', [], 12), makePlayer('p3', [], 12)];
    const state = finishGame(players);
    expect(state.winners.sort()).toEqual(['p2', 'p3']);
  });
});
