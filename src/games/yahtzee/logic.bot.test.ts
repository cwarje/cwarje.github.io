import { describe, it, expect } from 'vitest';
import { decideBotHolds, shouldReroll } from './logic';
import type { Scorecard } from './types';

function blankScorecard(): Scorecard {
  return {
    ones: null,
    twos: null,
    threes: null,
    fours: null,
    fives: null,
    sixes: null,
    threeOfAKind: null,
    fourOfAKind: null,
    fullHouse: null,
    smallStraight: null,
    largeStraight: null,
    yahtzee: null,
    chance: null,
  };
}

describe('decideBotHolds', () => {
  it('holds only the target face in the upper section', () => {
    expect(decideBotHolds([1, 1, 3, 4, 5], 'ones')).toEqual([true, true, false, false, false]);
  });

  it('holds dice >= 4 for chance', () => {
    expect(decideBotHolds([1, 4, 4, 6, 2], 'chance')).toEqual([false, true, true, true, false]);
  });

  it('holds both pairs when chasing multiples', () => {
    expect(decideBotHolds([2, 2, 5, 5, 1], 'threeOfAKind')).toEqual([true, true, true, true, false]);
  });

  it('holds all dice when a full house is already rolled', () => {
    expect(decideBotHolds([3, 3, 3, 2, 2], 'fullHouse')).toEqual([true, true, true, true, true]);
  });

  it('holds one die per value along the best straight window', () => {
    // 23456 ties 12345 on distinct count (4) but wins on sum of present faces → keep 2,3,4,6
    expect(decideBotHolds([1, 2, 3, 4, 6], 'largeStraight')).toEqual([false, true, true, true, true]);
  });
});

describe('shouldReroll', () => {
  const sc = blankScorecard();

  it('keeps rolling upper rows until five of the face', () => {
    expect(shouldReroll([6, 6, 6, 1, 2], 'sixes', sc, 2)).toBe(true);
    expect(shouldReroll([6, 6, 6, 6, 6], 'sixes', sc, 1)).toBe(false);
  });

  it('does not reroll under joker rules', () => {
    const jokerSc: Scorecard = { ...blankScorecard(), yahtzee: 50 };
    expect(shouldReroll([4, 4, 4, 4, 4], 'fours', jokerSc, 2)).toBe(false);
  });

  it('stops on a made full house', () => {
    expect(shouldReroll([3, 3, 3, 2, 2], 'fullHouse', sc, 1)).toBe(false);
  });

  it('rerolls chance on the last roll when the sum is very low', () => {
    expect(shouldReroll([1, 1, 2, 2, 3], 'chance', sc, 1)).toBe(true);
  });

  it('does not reroll chance on the last roll when the sum is decent', () => {
    expect(shouldReroll([4, 4, 4, 4, 5], 'chance', sc, 1)).toBe(false);
  });
});
