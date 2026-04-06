import { describe, it, expect } from 'vitest';
import { decideBotHolds, runYahtzeeBotTurn, shouldReroll, willYahtzeeBotScore } from './logic';
import type { Scorecard, YahtzeeState } from './types';

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

function makeBotTurnState(overrides: Partial<YahtzeeState> = {}): YahtzeeState {
  return {
    players: [
      {
        id: 'bot',
        name: 'Bot',
        color: 'red',
        isBot: true,
        scorecard: blankScorecard(),
        totalScore: 0,
      },
      {
        id: 'human',
        name: 'Human',
        color: 'blue',
        isBot: false,
        scorecard: blankScorecard(),
        totalScore: 0,
      },
    ],
    currentPlayerIndex: 0,
    dice: [1, 1, 1, 2, 3],
    held: [false, false, false, false, false],
    botReadyToReroll: false,
    rollsLeft: 1,
    round: 1,
    gameOver: false,
    yahtzeeBonus: {},
    lastScoredCategory: {},
    ...overrides,
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

describe('runYahtzeeBotTurn', () => {
  it('sets holds first, then uses the final reroll on the next step', () => {
    const state = makeBotTurnState({
      dice: [1, 1, 1, 4, 6],
      rollsLeft: 1,
      botReadyToReroll: false,
    });

    const afterHolds = runYahtzeeBotTurn(state) as YahtzeeState;
    expect(afterHolds.currentPlayerIndex).toBe(0);
    expect(afterHolds.rollsLeft).toBe(1);
    expect(afterHolds.dice).toEqual(state.dice);
    expect(afterHolds.botReadyToReroll).toBe(true);
    expect(afterHolds.held.some(Boolean)).toBe(true);

    const afterReroll = runYahtzeeBotTurn(afterHolds) as YahtzeeState;
    expect(afterReroll.currentPlayerIndex).toBe(0);
    expect(afterReroll.rollsLeft).toBe(0);
    expect(afterReroll.botReadyToReroll).toBe(false);
  });

  it('scores only after all rerolls are exhausted', () => {
    const state = makeBotTurnState({
      dice: [1, 1, 1, 4, 6],
      rollsLeft: 0,
    });

    const next = runYahtzeeBotTurn(state) as YahtzeeState;
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.rollsLeft).toBe(3);
  });
});

describe('willYahtzeeBotScore', () => {
  it('returns false when rolls remain', () => {
    const state = makeBotTurnState({ rollsLeft: 1 });
    expect(willYahtzeeBotScore(state)).toBe(false);
  });

  it('returns true only when no rolls remain', () => {
    const state = makeBotTurnState({ rollsLeft: 0 });
    expect(willYahtzeeBotScore(state)).toBe(true);
  });
});
