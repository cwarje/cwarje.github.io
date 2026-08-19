import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import {
  createBackgammonState,
  getBackgammonWinners,
  isBackgammonOver,
  processBackgammonAction,
  runBackgammonBotTurn,
} from './logic';
import { cloneState, diceToMovesRemaining, getLegalMovesForRemainingDice } from './rules';
import { createStartingPoints } from './types';

function makePlayers(): Player[] {
  return [
    { id: 'p1', name: 'White', color: 'red', isBot: false, isHost: true, connected: true },
    { id: 'p2', name: 'Black', color: 'blue', isBot: false, isHost: false, connected: true },
  ];
}

describe('createBackgammonState', () => {
  it('creates standard opening layout', () => {
    const state = createBackgammonState(makePlayers());
    expect(state.points).toEqual(createStartingPoints());
    expect(state.bar).toEqual({ white: 0, black: 0 });
    expect(state.off).toEqual({ white: 0, black: 0 });
    expect(state.phase).toBe('pre-roll');
    expect(state.players[0]?.side).toBe('white');
    expect(state.players[1]?.side).toBe('black');
    expect(state.matchFormat).toBe('single');
    expect(state.winsNeeded).toBe(1);
    expect(state.matchWins).toEqual({ p1: 0, p2: 0 });
    expect(state.seriesOver).toBe(false);
  });

  it('supports best-of-3 match format', () => {
    const state = createBackgammonState(makePlayers(), { backgammonMatchFormat: 'best-of-3' });
    expect(state.matchFormat).toBe('best-of-3');
    expect(state.winsNeeded).toBe(2);
  });

  it('requires exactly 2 players', () => {
    expect(() => createBackgammonState([makePlayers()[0]!])).toThrow();
  });
});

describe('processBackgammonAction', () => {
  it('ignores invalid actions unchanged', () => {
    const state = createBackgammonState(makePlayers());
    const next = processBackgammonAction(state, { type: 'move', from: 0, to: 1 }, 'p2');
    expect(next).toBe(state);
  });

  it('allows roll on pre-roll for current player', () => {
    const state = createBackgammonState(makePlayers());
    const next = processBackgammonAction(state, { type: 'roll' }, 'p1');
    expect(next).not.toBe(state);
    expect(next.dice).not.toBeNull();
    expect(next.phase === 'moving' || next.phase === 'pre-roll').toBe(true);
  });

  it('hits blot and sends checker to bar', () => {
    let state = createBackgammonState(makePlayers());
    state = {
      ...cloneState(state),
      points: Array(24).fill(0),
      currentPlayerIndex: 0,
      phase: 'moving',
      dice: [4, 2],
      movesRemaining: [4],
    };
    state.points[10] = 1;
    state.points[6] = -1;

    const next = processBackgammonAction(state, { type: 'move', from: 10, to: 6 }, 'p1');
    expect(next.bar.black).toBe(1);
    expect(next.points[6]).toBe(1);
    expect(next.points[10]).toBe(0);
  });

  it('passes turn when no legal moves after roll', () => {
    let state = createBackgammonState(makePlayers());
    state = {
      ...cloneState(state),
      points: Array(24).fill(0),
      bar: { white: 2, black: 0 },
      currentPlayerIndex: 0,
      phase: 'moving',
      dice: [3, 5],
      movesRemaining: [3, 5],
    };

    const blocked = Array(24).fill(0);
    for (let i = 18; i <= 22; i++) blocked[i] = -2;
    state = { ...state, points: blocked };

    const next = processBackgammonAction(state, { type: 'end-turn' }, 'p1');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe('pre-roll');
  });

  it('detects win when all checkers borne off', () => {
    const points = Array(24).fill(0);
    points[0] = 1;
    let state = createBackgammonState(makePlayers());
    state = {
      ...cloneState(state),
      points,
      bar: { white: 0, black: 0 },
      off: { white: 14, black: 0 },
      currentPlayerIndex: 0,
      phase: 'moving',
      dice: [1, 2],
      movesRemaining: [1],
    };

    const next = processBackgammonAction(state, { type: 'move', from: 0, to: 'off' }, 'p1');
    expect(next.phase).toBe('finished');
    expect(next.seriesOver).toBe(true);
    expect(isBackgammonOver(next)).toBe(true);
    expect(getBackgammonWinners(next)).toEqual(['p1']);
  });
});

function makeNearWinState(): ReturnType<typeof createBackgammonState> {
  const points = Array(24).fill(0);
  points[0] = 1;
  let state = createBackgammonState(makePlayers(), { backgammonMatchFormat: 'best-of-3' });
  state = {
    ...cloneState(state),
    points,
    bar: { white: 0, black: 0 },
    off: { white: 14, black: 0 },
    currentPlayerIndex: 0,
    phase: 'moving',
    dice: [1, 2],
    movesRemaining: [1],
  };
  return state;
}

describe('best-of-3 match format', () => {
  it('does not end the match after the first game', () => {
    const next = processBackgammonAction(makeNearWinState(), { type: 'move', from: 0, to: 'off' }, 'p1');
    expect(next.phase).toBe('finished');
    expect(next.seriesOver).toBe(false);
    expect(next.matchWins.p1).toBe(1);
    expect(isBackgammonOver(next)).toBe(false);
    expect(getBackgammonWinners(next)).toEqual([]);
  });

  it('starts the next game with a fresh board', () => {
    const afterWin = processBackgammonAction(makeNearWinState(), { type: 'move', from: 0, to: 'off' }, 'p1');
    const next = processBackgammonAction(afterWin, { type: 'start-next-game' }, 'p1');
    expect(next.phase).toBe('pre-roll');
    expect(next.points).toEqual(createStartingPoints());
    expect(next.off).toEqual({ white: 0, black: 0 });
    expect(next.matchWins.p1).toBe(1);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('ends the match after two wins', () => {
    let state = makeNearWinState();
    state = processBackgammonAction(state, { type: 'move', from: 0, to: 'off' }, 'p1');
    state = processBackgammonAction(state, { type: 'start-next-game' }, 'p1');

    const points = Array(24).fill(0);
    points[0] = 1;
    state = {
      ...cloneState(state),
      points,
      off: { white: 14, black: 0 },
      currentPlayerIndex: 0,
      phase: 'moving',
      dice: [1, 2],
      movesRemaining: [1],
    };

    const next = processBackgammonAction(state, { type: 'move', from: 0, to: 'off' }, 'p1');
    expect(next.seriesOver).toBe(true);
    expect(next.matchWins.p1).toBe(2);
    expect(isBackgammonOver(next)).toBe(true);
    expect(getBackgammonWinners(next)).toEqual(['p1']);
  });
});

describe('processBackgammonAction continued', () => {
  it('preserves lastMove when turn ends after final die', () => {
    let state = createBackgammonState(makePlayers());
    state = {
      ...cloneState(state),
      points: Array(24).fill(0),
      currentPlayerIndex: 0,
      phase: 'moving',
      dice: [2, 4],
      movesRemaining: [2],
    };
    state.points[10] = 1;

    const next = processBackgammonAction(state, { type: 'move', from: 10, to: 8 }, 'p1');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe('pre-roll');
    expect(next.lastMove).toEqual({ from: 10, to: 8, dieUsed: 2, hit: false, side: 'white' });
  });
});

describe('doubles', () => {
  it('grants four moves on doubles', () => {
    expect(diceToMovesRemaining(3, 3)).toEqual([3, 3, 3, 3]);
  });
});

describe('must-use-max-dice', () => {
  it('requires using both dice when both legal', () => {
    let state = createBackgammonState(makePlayers());
    state = {
      ...cloneState(state),
      points: Array(24).fill(0),
      bar: { white: 0, black: 0 },
      off: { white: 0, black: 0 },
      currentPlayerIndex: 0,
      phase: 'moving',
      dice: [2, 1],
      movesRemaining: [2, 1],
    };
    state.points[10] = 2;

    const legalFirst = getLegalMovesForRemainingDice(state);
    expect(legalFirst.some((m) => m.from === 10 && m.to === 8)).toBe(true);
  });
});

describe('runBackgammonBotTurn', () => {
  it('does not throw for bot pre-roll', () => {
    const players = makePlayers();
    players[0]!.isBot = true;
    const state = createBackgammonState(players);
    expect(() => runBackgammonBotTurn(state)).not.toThrow();
    const next = runBackgammonBotTurn(state);
    expect(next).not.toBe(state);
  });
});
