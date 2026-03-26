import { describe, expect, it } from 'vitest';
import type { Card, TableItem } from './types';
import {
  achievableSumsForCards,
  findPossibleCaptures,
  isValidBuild,
  isValidCapture,
  playerCanCaptureBuildValue,
  resolveBuildDeclaredValue,
} from './rules';
import { processByggkasinoAction } from './logic';
import type { ByggkasinoState } from './types';

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
    const table: TableItem[] = [{ kind: 'card', card: C4 }];
    expect(isValidBuild(AH, [0], table, 5)).toBe(true);
    expect(isValidBuild(AH, [0], table, 18)).toBe(true);
    expect(isValidBuild(AH, [0], table, 6)).toBe(false);
  });

  it('allows J in a build sum', () => {
    const five: Card = { suit: 'diamonds', rank: 5 };
    const table: TableItem[] = [{ kind: 'card', card: five }];
    expect(isValidBuild(JH, [0], table, 16)).toBe(true);
  });
});

describe('isValidCapture', () => {
  it('J captures loose J by value', () => {
    const table: TableItem[] = [{ kind: 'card', card: { suit: 'clubs', rank: 11 } }];
    expect(isValidCapture(JH, table, [0])).toBe(true);
  });

  it('ace captures build declared 14', () => {
    const H10: Card = { suit: 'hearts', rank: 10 };
    const table: TableItem[] = [
      {
        kind: 'build',
        build: { cards: [H10, C4], value: 14, ownerId: 'x' },
      },
    ];
    expect(isValidCapture(AH, table, [0])).toBe(true);
  });

  it('captures multi-card sum with ace low', () => {
    const table: TableItem[] = [{ kind: 'card', card: C3 }, { kind: 'card', card: C3 }];
    const seven: Card = { suit: 'diamonds', rank: 7 };
    expect(isValidCapture(seven, table, [0, 1])).toBe(true);
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
      tableItems: [{ kind: 'card', card: C4 }],
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

    const next = processByggkasinoAction(
      s,
      { type: 'build', playedCard: AH, tableCardIndices: [0], declaredValue: 5 },
      'p0'
    ) as ByggkasinoState;
    expect(next).not.toBe(s);
    expect(next.tableItems.some(it => it.kind === 'build' && it.build.value === 5)).toBe(true);
  });
});

describe('findPossibleCaptures', () => {
  it('returns build capture for J on build 11', () => {
    const table: TableItem[] = [
      { kind: 'build', build: { cards: [C5, C6], value: 11, ownerId: 'x' } },
    ];
    const groups = findPossibleCaptures({ suit: 'diamonds', rank: 11 }, table);
    expect(groups.some(g => g.includes(0))).toBe(true);
  });
});
