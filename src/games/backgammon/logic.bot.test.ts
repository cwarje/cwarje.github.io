import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import { evaluatePosition, pickBestBotMove, pipCount } from './botEvaluation';
import { createBackgammonState } from './logic';
import { cloneState, getAllLegalTurnSequences } from './rules';
import type { BackgammonState } from './types';

function makePlayers(botWhite = true): Player[] {
  return [
    { id: 'p1', name: 'White', color: 'red', isBot: botWhite, isHost: true, connected: true },
    { id: 'p2', name: 'Black', color: 'blue', isBot: false, isHost: false, connected: true },
  ];
}

function movingState(overrides: Partial<BackgammonState> & Pick<BackgammonState, 'points'>): BackgammonState {
  const base = createBackgammonState(makePlayers());
  return {
    ...cloneState(base),
    phase: 'moving',
    currentPlayerIndex: 0,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    dice: [1, 2],
    movesRemaining: [1, 2],
    ...overrides,
  };
}

describe('pipCount', () => {
  it('counts bar checkers as 25 pips each', () => {
    const state = movingState({
      points: Array(24).fill(0),
      bar: { white: 1, black: 0 },
      movesRemaining: [3],
      dice: [3, 5],
    });
    expect(pipCount(state, 'white')).toBe(25);
  });

  it('sums checker distances for on-board checkers', () => {
    const points = Array(24).fill(0);
    points[5] = 2;
    const state = movingState({ points, movesRemaining: [1], dice: [1, 2] });
    expect(pipCount(state, 'white')).toBe(12);
  });
});

describe('pickBestBotMove', () => {
  it('bears off when all checkers are in the home board', () => {
    const points = Array(24).fill(0);
    points[2] = 1;
    points[0] = 1;
    const state = movingState({
      points,
      dice: [3, 1],
      movesRemaining: [3, 1],
    });

    const move = pickBestBotMove(state);
    expect(move).not.toBeNull();
    expect(move!.to).toBe('off');
  });

  it('re-enters from the bar before moving other checkers', () => {
    const points = Array(24).fill(0);
    points[10] = 1;
    const state = movingState({
      points,
      bar: { white: 1, black: 0 },
      dice: [4, 2],
      movesRemaining: [4, 2],
    });

    const move = pickBestBotMove(state);
    expect(move).not.toBeNull();
    expect(move!.from).toBe('bar');
  });

  it('hits an opponent blot when that improves the position', () => {
    const points = Array(24).fill(0);
    points[10] = 1;
    points[5] = -1;
    const state = movingState({
      points,
      dice: [5, 3],
      movesRemaining: [5, 3],
    });

    const move = pickBestBotMove(state);
    expect(move).not.toBeNull();
    expect(move!.to).toBe(5);
    expect(move!.hit).toBe(true);
  });

  it('makes a point by joining a single checker', () => {
    const points = Array(24).fill(0);
    points[0] = 1;
    points[3] = 1;
    const state = movingState({
      points,
      dice: [3, 1],
      movesRemaining: [3, 1],
    });

    const move = pickBestBotMove(state);
    expect(move).not.toBeNull();
    expect(move!.from).toBe(3);
    expect(move!.to).toBe(0);
  });

  it('chooses a first move that is part of a full two-dice sequence', () => {
    const points = Array(24).fill(0);
    points[10] = 1;
    const state = movingState({
      points,
      dice: [2, 1],
      movesRemaining: [2, 1],
    });

    const move = pickBestBotMove(state);
    expect(move).not.toBeNull();

    const sequences = getAllLegalTurnSequences(state);
    const matching = sequences.filter(
      (seq) => seq[0]?.from === move!.from && seq[0]?.to === move!.to,
    );
    expect(matching.some((seq) => seq.length === 2)).toBe(true);
  });
});

describe('evaluatePosition', () => {
  it('prefers lower pip counts for the evaluating side', () => {
    const advanced = movingState({
      points: (() => {
        const p = Array(24).fill(0);
        p[2] = 1;
        return p;
      })(),
      movesRemaining: [1],
      dice: [1, 2],
    });
    const behind = movingState({
      points: (() => {
        const p = Array(24).fill(0);
        p[18] = 1;
        return p;
      })(),
      movesRemaining: [1],
      dice: [1, 2],
    });

    expect(evaluatePosition(advanced, 'white')).toBeGreaterThan(evaluatePosition(behind, 'white'));
  });
});
