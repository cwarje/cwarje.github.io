import { describe, expect, it } from 'vitest';
import { computeXpAwardsForGame, isReadyToAwardXp } from './awards';
import type { HeartsState } from '../games/hearts/types';
import type { PokerState } from '../games/poker/types';
import type { CribbageState } from '../games/cribbage/types';

const WEEKDAY = new Date('2026-07-06T12:00:00Z');

describe('xp awards', () => {
  it('awards hearts placement by ascending total score', () => {
    const state = {
      gameOver: true,
      players: [
        { id: 'a', totalScore: 50 },
        { id: 'b', totalScore: 80 },
        { id: 'c', totalScore: 120 },
      ],
    } as unknown as HeartsState;

    const awards = computeXpAwardsForGame('hearts', state, { at: WEEKDAY });
    expect(awards.get('a')).toBe(20);
    expect(awards.get('b')).toBe(10);
    expect(awards.get('c')).toBeUndefined();
  });

  it('waits for poker sessionOver', () => {
    const handOver = { gameOver: true, sessionOver: false } as PokerState;
    const sessionDone = { gameOver: true, sessionOver: true } as PokerState;
    expect(isReadyToAwardXp('poker', handOver)).toBe(false);
    expect(isReadyToAwardXp('poker', sessionDone)).toBe(true);
  });

  it('waits for cribbage game-over phase', () => {
    const showPhase = { phase: 'show', gameOver: true } as CribbageState;
    const done = { phase: 'game-over', gameOver: true } as CribbageState;
    expect(isReadyToAwardXp('cribbage', showPhase)).toBe(false);
    expect(isReadyToAwardXp('cribbage', done)).toBe(true);
  });
});
