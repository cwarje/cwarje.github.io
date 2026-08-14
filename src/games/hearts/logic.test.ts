import { describe, expect, it } from 'vitest';
import type { Card, HeartsPlayer, HeartsState } from './types';
import {
  getPassDirection,
  getPassDirectionLabel,
  getPassTargetIndex,
  processHeartsAction,
} from './logic';

function card(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank };
}

function makePlayer(id: string, hand: Card[]): HeartsPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: false,
    hand,
    tricksTaken: [],
    roundScore: 0,
    totalScore: 0,
  };
}

describe('hearts pass direction cycle', () => {
  it('uses 4-step cycle for 4 players', () => {
    expect(getPassDirection(1, 4)).toBe('left');
    expect(getPassDirection(2, 4)).toBe('right');
    expect(getPassDirection(3, 4)).toBe('across');
    expect(getPassDirection(4, 4)).toBe('none');
    expect(getPassDirection(5, 4)).toBe('left');
    expect(getPassDirection(8, 4)).toBe('none');
  });

  it('uses 5-step cycle for 5 players', () => {
    expect(getPassDirection(1, 5)).toBe('left');
    expect(getPassDirection(2, 5)).toBe('right');
    expect(getPassDirection(3, 5)).toBe('across');
    expect(getPassDirection(4, 5)).toBe('across-right');
    expect(getPassDirection(5, 5)).toBe('none');
    expect(getPassDirection(6, 5)).toBe('left');
    expect(getPassDirection(10, 5)).toBe('none');
  });
});

describe('hearts pass target index', () => {
  const playerCount = 5;

  it('passes left (+1)', () => {
    expect(getPassTargetIndex(0, 'left', playerCount)).toBe(1);
    expect(getPassTargetIndex(4, 'left', playerCount)).toBe(0);
  });

  it('passes right (-1)', () => {
    expect(getPassTargetIndex(0, 'right', playerCount)).toBe(4);
    expect(getPassTargetIndex(1, 'right', playerCount)).toBe(0);
  });

  it('passes across left (+2)', () => {
    expect(getPassTargetIndex(0, 'across', playerCount)).toBe(2);
    expect(getPassTargetIndex(3, 'across', playerCount)).toBe(0);
  });

  it('passes across right (-2)', () => {
    expect(getPassTargetIndex(0, 'across-right', playerCount)).toBe(3);
    expect(getPassTargetIndex(1, 'across-right', playerCount)).toBe(4);
    expect(getPassTargetIndex(2, 'across-right', playerCount)).toBe(0);
    expect(getPassTargetIndex(3, 'across-right', playerCount)).toBe(1);
    expect(getPassTargetIndex(4, 'across-right', playerCount)).toBe(2);
  });
});

describe('hearts pass direction labels', () => {
  it('labels across as across left for 5 players', () => {
    expect(getPassDirectionLabel('across', 5)).toBe('across left');
    expect(getPassDirectionLabel('across-right', 5)).toBe('across right');
  });

  it('labels across plainly for 4 players', () => {
    expect(getPassDirectionLabel('across', 4)).toBe('across');
  });
});

describe('hearts pass execution', () => {
  it('moves cards to across-right recipients for 5 players', () => {
    const passA = card('hearts', 14);
    const passB = card('spades', 12);
    const keepA = card('clubs', 3);
    const keepB = card('diamonds', 5);
    const keepC = card('clubs', 7);
    const keepD = card('diamonds', 9);

    const state: HeartsState = {
      players: [
        makePlayer('p0', [passA, passB, keepA, keepB]),
        makePlayer('p1', [keepC, keepD, card('clubs', 4), card('diamonds', 6)]),
        makePlayer('p2', [card('clubs', 8), card('diamonds', 10), card('spades', 3), card('spades', 5)]),
        makePlayer('p3', [card('clubs', 11), card('diamonds', 12), card('spades', 7), card('spades', 9)]),
        makePlayer('p4', [card('clubs', 13), card('diamonds', 14), card('spades', 11), card('spades', 13)]),
      ],
      targetScore: 100,
      phase: 'passing',
      passDirection: 'across-right',
      passSelections: {
        p0: [passA, passB],
        p1: [keepC, keepD],
        p2: [card('clubs', 8), card('diamonds', 10)],
        p3: [card('clubs', 11), card('diamonds', 12)],
        p4: [card('clubs', 13), card('diamonds', 14)],
      },
      passConfirmed: {
        p0: true,
        p1: true,
        p2: true,
        p3: true,
      },
      currentTrick: [],
      currentPlayerIndex: 0,
      leadPlayerIndex: 0,
      heartsBroken: false,
      trickNumber: 1,
      roundNumber: 4,
      gameOver: false,
      winners: [],
      trickWinner: null,
      moonShooterId: null,
    };

    const next = processHeartsAction(state, { type: 'confirm-pass' }, 'p4') as HeartsState;

    expect(next.phase).toBe('playing');
    expect(next.players[3].hand).toContainEqual(passA);
    expect(next.players[3].hand).toContainEqual(passB);
    expect(next.players[0].hand).not.toContainEqual(passA);
    expect(next.players[0].hand).not.toContainEqual(passB);
    expect(next.players[0].hand).toContainEqual(keepA);
    expect(next.players[0].hand).toContainEqual(keepB);
  });
});
