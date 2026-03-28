import { describe, expect, it } from 'vitest';
import type { Card, TableSlot } from './types';
import {
  achievableSumsForCards,
  findPossibleCaptures,
  isValidBuild,
  isValidCapture,
  isValidTableGroup,
  playerCanCaptureBuildValue,
  resolveBuildDeclaredValue,
  resolveHandAssistedGroupDeclaredValue,
  resolveTableGroupDeclaredValue,
  resolveTableGroupWithBuildsDeclaredValue,
  scoreRound,
} from './rules';
import { processByggkasinoAction } from './logic';
import type { ByggkasinoPlayer, ByggkasinoState } from './types';

const AH: Card = { suit: 'hearts', rank: 1 };
const C4: Card = { suit: 'clubs', rank: 4 };
const C3: Card = { suit: 'clubs', rank: 3 };
const C5: Card = { suit: 'clubs', rank: 5 };
const C6: Card = { suit: 'clubs', rank: 6 };
const S2: Card = { suit: 'spades', rank: 2 };
const D10: Card = { suit: 'diamonds', rank: 10 };
const JH: Card = { suit: 'hearts', rank: 11 };

describe('cardValuesForSum via rules helpers', () => {
  it('achievableSumsForCards picks ace low or high', () => {
    expect(achievableSumsForCards([AH, C3, C3])).toEqual(expect.arrayContaining([7, 20]));
    expect(achievableSumsForCards([AH, C4])).toEqual(expect.arrayContaining([5, 18]));
  });

  it('2 of spades and 10 of diamonds have alternate values', () => {
    expect(achievableSumsForCards([S2])).toEqual([2, 15]);
    expect(achievableSumsForCards([D10])).toEqual([10, 16]);
    expect(achievableSumsForCards([S2, { suit: 'clubs', rank: 5 }])).toEqual(expect.arrayContaining([7, 20]));
  });
});

describe('isValidBuild', () => {
  it('accepts ace + 4 as 5 or 18', () => {
    const table: TableSlot[] = [{ kind: 'card', card: C4 }];
    expect(isValidBuild(AH, [0], table, 5)).toBe(true);
    expect(isValidBuild(AH, [0], table, 18)).toBe(true);
    expect(isValidBuild(AH, [0], table, 6)).toBe(false);
  });

  it('allows J in a build sum', () => {
    const five: Card = { suit: 'diamonds', rank: 5 };
    const table: TableSlot[] = [{ kind: 'card', card: five }];
    expect(isValidBuild(JH, [0], table, 16)).toBe(true);
  });

  it('accepts hand card plus two table cards when sum matches', () => {
    const table: TableSlot[] = [{ kind: 'card', card: C4 }, { kind: 'card', card: C3 }];
    const seven: Card = { suit: 'diamonds', rank: 7 };
    expect(isValidBuild(seven, [0, 1], table, 14)).toBe(true);
    expect(isValidBuild(seven, [0, 1], table, 10)).toBe(false);
  });

  it('accepts hand card plus three table cards when sum matches', () => {
    const H8: Card = { suit: 'hearts', rank: 8 };
    const table: TableSlot[] = [
      { kind: 'card', card: H8 },
      { kind: 'card', card: C4 },
      { kind: 'card', card: C3 },
    ];
    const handCard: Card = { suit: 'diamonds', rank: 3 };
    expect(isValidBuild(handCard, [0, 1, 2], table, 18)).toBe(true);
    expect(isValidBuild(handCard, [0, 1, 2], table, 15)).toBe(false);
  });
});

describe('isValidCapture', () => {
  it('J captures loose J by value', () => {
    const table: TableSlot[] = [{ kind: 'card', card: { suit: 'clubs', rank: 11 } }];
    expect(isValidCapture(JH, table, [0])).toBe(true);
  });

  it('ace captures build declared 14', () => {
    const H10: Card = { suit: 'hearts', rank: 10 };
    const table: TableSlot[] = [
      {
        kind: 'build',
        build: { cards: [H10, C4], value: 14, ownerId: 'x', groupCount: 1 },
      },
    ];
    expect(isValidCapture(AH, table, [0])).toBe(true);
  });

  it('rejects multi-card loose sum without a grouped build', () => {
    const table: TableSlot[] = [{ kind: 'card', card: C3 }, { kind: 'card', card: C3 }];
    const seven: Card = { suit: 'diamonds', rank: 7 };
    expect(isValidCapture(seven, table, [0, 1])).toBe(false);
  });

  it('rejects capturing a loose card when its capture value does not match the played card', () => {
    const table9: TableSlot[] = [{ kind: 'card', card: { suit: 'clubs', rank: 9 } }];
    const tenH: Card = { suit: 'hearts', rank: 10 };
    const tenD: Card = { suit: 'diamonds', rank: 10 };
    expect(isValidCapture(tenH, table9, [0])).toBe(false);
    expect(isValidCapture(tenD, table9, [0])).toBe(false);

    const table7: TableSlot[] = [{ kind: 'card', card: { suit: 'clubs', rank: 7 } }];
    const eight: Card = { suit: 'hearts', rank: 8 };
    expect(isValidCapture(eight, table7, [0])).toBe(false);
  });

  it('captures a grouped build whose value matches the hand card', () => {
    const table: TableSlot[] = [
      {
        kind: 'build',
        build: { cards: [C3, C3], value: 6, ownerId: 'p0', groupCount: 1 },
      },
    ];
    const six: Card = { suit: 'diamonds', rank: 6 };
    expect(isValidCapture(six, table, [0])).toBe(true);
  });

  it('allows two loose cards when each individually matches', () => {
    const sevenH: Card = { suit: 'hearts', rank: 7 };
    const table: TableSlot[] = [{ kind: 'card', card: sevenH }, { kind: 'card', card: sevenH }];
    const sevenD: Card = { suit: 'diamonds', rank: 7 };
    expect(isValidCapture(sevenD, table, [0, 1])).toBe(true);
  });

  it('allows capturing build 10 or loose 10, but not both in one capture', () => {
    const C2: Card = { suit: 'clubs', rank: 2 };
    const C8: Card = { suit: 'clubs', rank: 8 };
    const S10: Card = { suit: 'spades', rank: 10 };
    const tenC: Card = { suit: 'clubs', rank: 10 };
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C2, C8], value: 10, ownerId: 'x', groupCount: 1 } },
      { kind: 'card', card: S10 },
    ];
    expect(isValidCapture(tenC, table, [0])).toBe(true);
    expect(isValidCapture(tenC, table, [1])).toBe(true);
    expect(isValidCapture(tenC, table, [0, 1])).toBe(false);
  });

  it('rejects capturing grouped 13 plus loose king together', () => {
    const king: Card = { suit: 'hearts', rank: 13 };
    const table: TableSlot[] = [
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
    ];
    expect(isValidCapture(king, table, [0])).toBe(true);
    expect(isValidCapture(king, table, [1])).toBe(true);
    expect(isValidCapture(king, table, [0, 1])).toBe(false);
  });

  it('5 of spades captures only when selection is the full occupied table', () => {
    const S5: Card = { suit: 'spades', rank: 5 };
    const table: TableSlot[] = [{ kind: 'card', card: C3 }, null, { kind: 'card', card: C6 }];
    expect(isValidCapture(S5, table, [0, 2])).toBe(true);
    expect(isValidCapture(S5, table, [0])).toBe(false);
    expect(isValidCapture(S5, table, [])).toBe(false);
  });

  it('5 of spades captures empty table with empty index set (self-sweep)', () => {
    const S5: Card = { suit: 'spades', rank: 5 };
    const table: TableSlot[] = [null, null];
    expect(isValidCapture(S5, table, [])).toBe(true);
  });
});

describe('playerCanCaptureBuildValue', () => {
  it('ace can capture build 14 or 1', () => {
    const hand: Card[] = [AH, { suit: 'clubs', rank: 7 }];
    expect(playerCanCaptureBuildValue(hand, 14)).toBe(true);
    expect(playerCanCaptureBuildValue(hand, 1)).toBe(true);
  });
});

describe('resolveBuildDeclaredValue', () => {
  it('picks minimum capturable declared value', () => {
    const hand: Card[] = [AH, { suit: 'spades', rank: 5 }];
    const d = resolveBuildDeclaredValue(AH, [C4], hand, AH);
    expect(d).toBe(5);
  });
});

describe('isValidTableGroup and resolveTableGroupDeclaredValue', () => {
  it('isValidTableGroup requires two cards and a matching sum', () => {
    expect(isValidTableGroup([C3, C3], 6)).toBe(true);
    expect(isValidTableGroup([C3], 3)).toBe(false);
    expect(isValidTableGroup([C3, C3], 7)).toBe(false);
  });

  it('resolveTableGroupDeclaredValue requires a capturable value in hand', () => {
    const six: Card = { suit: 'diamonds', rank: 6 };
    expect(resolveTableGroupDeclaredValue([C3, C3], [six])).toBe(6);
    expect(resolveTableGroupDeclaredValue([C3, C3], [{ suit: 'clubs', rank: 8 }])).toBe(0);
  });
});

describe('resolveHandAssistedGroupDeclaredValue', () => {
  const H3: Card = { suit: 'hearts', rank: 3 };
  const S3: Card = { suit: 'spades', rank: 3 };

  it('allows grouping a matching loose card when another matching hand card remains', () => {
    const table: TableSlot[] = [{ kind: 'card', card: S3 }];
    const hand: Card[] = [C3, H3, C4, C5];
    expect(resolveHandAssistedGroupDeclaredValue(C3, table, [0], hand)).toBe(3);
  });

  it('allows grouping a matching build value when another matching hand card remains', () => {
    const table: TableSlot[] = [
      {
        kind: 'build',
        build: { cards: [S3, { suit: 'diamonds', rank: 3 }], value: 3, ownerId: 'p0', groupCount: 2 },
      },
    ];
    const hand: Card[] = [C3, H3, C4];
    expect(resolveHandAssistedGroupDeclaredValue(C3, table, [0], hand)).toBe(3);
  });

  it('rejects grouping when no follow-up capture card remains in hand', () => {
    const looseTable: TableSlot[] = [{ kind: 'card', card: S3 }];
    const groupedTable: TableSlot[] = [
      {
        kind: 'build',
        build: { cards: [S3, { suit: 'diamonds', rank: 3 }], value: 3, ownerId: 'p0', groupCount: 2 },
      },
    ];
    const hand: Card[] = [C3, C4, C5];
    expect(resolveHandAssistedGroupDeclaredValue(C3, looseTable, [0], hand)).toBe(0);
    expect(resolveHandAssistedGroupDeclaredValue(C3, groupedTable, [0], hand)).toBe(0);
  });
});

describe('processByggkasinoAction build with ace low sum', () => {
  it('accepts declaredValue 5 for ace + 4 when hand can capture 5', () => {
    const s: ByggkasinoState = {
      players: [
        {
          id: 'p0',
          name: 'A',
          color: 'red',
          isBot: false,
          hand: [AH, { suit: 'spades', rank: 5 }],
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
      tableSlots: [{ kind: 'card', card: C4 }],
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

    const next = processByggkasinoAction(
      s,
      { type: 'build', playedCard: AH, tableCardIndices: [0], declaredValue: 5 },
      'p0'
    ) as ByggkasinoState;
    expect(next).not.toBe(s);
    expect(next.tableSlots.some(it => it?.kind === 'build' && it.build.value === 5)).toBe(true);
  });
});

// findPossibleCaptures returns legal build-only and loose-only capture sets.
describe('findPossibleCaptures', () => {
  it('returns build capture for J on build 11', () => {
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C5, C6], value: 11, ownerId: 'x', groupCount: 1 } },
    ];
    const groups = findPossibleCaptures({ suit: 'diamonds', rank: 11 }, table);
    expect(groups.some(g => g.includes(0))).toBe(true);
  });

  it('5 of spades offers full-table index set when table is non-empty', () => {
    const S5: Card = { suit: 'spades', rank: 5 };
    const table: TableSlot[] = [
      { kind: 'card', card: C3 },
      {
        kind: 'build',
        build: { cards: [C4, C5], value: 9, ownerId: 'x', groupCount: 1 },
      },
    ];
    const groups = findPossibleCaptures(S5, table);
    expect(groups.some(g => g.length === 2 && g.includes(0) && g.includes(1))).toBe(true);
  });

  it('5 of spades yields empty index set as capture when table is empty', () => {
    const S5: Card = { suit: 'spades', rank: 5 };
    expect(findPossibleCaptures(S5, [null, null])).toEqual([[]]);
  });

  it('keeps build and loose captures separate for same value', () => {
    const C2: Card = { suit: 'clubs', rank: 2 };
    const C8: Card = { suit: 'clubs', rank: 8 };
    const S10: Card = { suit: 'spades', rank: 10 };
    const tenC: Card = { suit: 'clubs', rank: 10 };
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C2, C8], value: 10, ownerId: 'x', groupCount: 1 } },
      { kind: 'card', card: S10 },
    ];
    const groups = findPossibleCaptures(tenC, table).map(g => [...g].sort((a, b) => a - b));
    expect(groups).toContainEqual([0]);
    expect(groups).toContainEqual([1]);
    expect(groups).not.toContainEqual([0, 1]);
  });
});

describe('resolveTableGroupWithBuildsDeclaredValue', () => {
  it('resolves value for build + loose cards summing to the same value', () => {
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C3, C4], value: 7, ownerId: 'p0', groupCount: 1 } },
      { kind: 'card', card: AH },
      { kind: 'card', card: C6 },
    ];
    const hand: Card[] = [{ suit: 'hearts', rank: 7 }];
    expect(resolveTableGroupWithBuildsDeclaredValue(table, [0, 1, 2], hand)).toBe(7);
  });

  it('resolves value for two builds of the same value', () => {
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C3, C4], value: 7, ownerId: 'p0', groupCount: 1 } },
      { kind: 'build', build: { cards: [AH, C6], value: 7, ownerId: 'p0', groupCount: 1 } },
    ];
    const hand: Card[] = [{ suit: 'hearts', rank: 7 }];
    expect(resolveTableGroupWithBuildsDeclaredValue(table, [0, 1], hand)).toBe(7);
  });

  it('resolves value for build 13 + loose king', () => {
    const table: TableSlot[] = [
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
    ];
    const hand: Card[] = [{ suit: 'hearts', rank: 13 }];
    expect(resolveTableGroupWithBuildsDeclaredValue(table, [0, 1], hand)).toBe(13);
  });

  it('rejects builds with different values', () => {
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C3, C4], value: 7, ownerId: 'p0', groupCount: 1 } },
      { kind: 'build', build: { cards: [C3, C5], value: 8, ownerId: 'p1', groupCount: 1 } },
    ];
    const hand: Card[] = [{ suit: 'hearts', rank: 7 }, { suit: 'hearts', rank: 8 }];
    expect(resolveTableGroupWithBuildsDeclaredValue(table, [0, 1], hand)).toBe(0);
  });

  it('rejects single build without loose cards', () => {
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C3, C4], value: 7, ownerId: 'p0', groupCount: 1 } },
    ];
    const hand: Card[] = [{ suit: 'hearts', rank: 7 }];
    expect(resolveTableGroupWithBuildsDeclaredValue(table, [0], hand)).toBe(0);
  });

  it('rejects when loose cards do not sum to build value', () => {
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C3, C4], value: 7, ownerId: 'p0', groupCount: 1 } },
      { kind: 'card', card: C5 },
      { kind: 'card', card: C6 },
    ];
    const hand: Card[] = [{ suit: 'hearts', rank: 7 }];
    expect(resolveTableGroupWithBuildsDeclaredValue(table, [0, 1, 2], hand)).toBe(0);
  });

  it('rejects when hand cannot capture the declared value', () => {
    const table: TableSlot[] = [
      { kind: 'build', build: { cards: [C3, C4], value: 7, ownerId: 'p0', groupCount: 1 } },
      { kind: 'card', card: AH },
      { kind: 'card', card: C6 },
    ];
    const hand: Card[] = [{ suit: 'hearts', rank: 8 }];
    expect(resolveTableGroupWithBuildsDeclaredValue(table, [0, 1, 2], hand)).toBe(0);
  });
});

describe('scoreRound', () => {
  const basePlayer = (id: string, captured: Card[]): ByggkasinoPlayer => ({
    id,
    name: id,
    color: 'red',
    isBot: false,
    hand: [],
    capturedCards: captured,
    sweepCount: 0,
  });

  it('awards lastCapture only to the given player id', () => {
    const players = [basePlayer('p0', [C3]), basePlayer('p1', [C4, C5])];
    const withBonus = scoreRound(players, 'p0');
    expect(withBonus.p0.lastCapture).toBe(1);
    expect(withBonus.p1.lastCapture).toBe(0);
    expect(withBonus.p0.total).toBe(withBonus.p0.mostCards + withBonus.p0.lastCapture);
  });

  it('ignores unknown lastCapturePlayerId', () => {
    const players = [basePlayer('p0', [C3])];
    const out = scoreRound(players, 'nobody');
    expect(out.p0.lastCapture).toBe(0);
  });
});
