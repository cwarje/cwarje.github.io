import { afterEach, describe, expect, it } from 'vitest';
import type { MinigolfPlayer } from './types';
import {
  MINIGOLF_XP_STORAGE_KEY,
  computeMinigolfXpAwards,
  getMinigolfLevel,
  getMinigolfLevelProgress,
  readMinigolfXp,
  writeMinigolfXp,
} from './progress';

function makePlayer(id: string, scores: number[]): MinigolfPlayer {
  return {
    id,
    name: id,
    color: 'blue',
    isBot: false,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    strokes: 0,
    holed: true,
    gaveUp: false,
    scores,
    botNextStrokeTick: -1,
    sinkTicks: 0,
    holeSinkPending: false,
    lastStrokePos: { x: 0, y: 0 },
  };
}

describe('minigolf progress', () => {
  afterEach(() => {
    localStorage.removeItem(MINIGOLF_XP_STORAGE_KEY);
  });

  it('reads and writes xp from localStorage', () => {
    expect(readMinigolfXp()).toBe(0);
    writeMinigolfXp(45);
    expect(readMinigolfXp()).toBe(45);
  });

  it('derives level and progress from total xp', () => {
    expect(getMinigolfLevel(0)).toBe(1);
    expect(getMinigolfLevel(99)).toBe(1);
    expect(getMinigolfLevel(100)).toBe(2);
    expect(getMinigolfLevelProgress(45)).toEqual({
      level: 1,
      xpIntoLevel: 45,
      xpForNextLevel: 100,
    });
    expect(getMinigolfLevelProgress(200)).toEqual({
      level: 3,
      xpIntoLevel: 0,
      xpForNextLevel: 100,
    });
  });

  it('awards 20/10 xp for first and second place tiers on a 9-hole round', () => {
    const awards = computeMinigolfXpAwards(
      [
        makePlayer('a', [3, 4]),
        makePlayer('b', [4, 4]),
        makePlayer('c', [5, 5]),
      ],
      9,
    );
    expect(awards.get('a')).toBe(20);
    expect(awards.get('b')).toBe(10);
    expect(awards.get('c')).toBeUndefined();
  });

  it('awards 10/5 xp for first and second place tiers on a 3-hole round', () => {
    const awards = computeMinigolfXpAwards(
      [
        makePlayer('a', [3, 4, 2]),
        makePlayer('b', [4, 4, 3]),
        makePlayer('c', [5, 5, 4]),
      ],
      3,
    );
    expect(awards.get('a')).toBe(10);
    expect(awards.get('b')).toBe(5);
    expect(awards.get('c')).toBeUndefined();
  });

  it('awards 40/20 xp for first and second place tiers on an 18-hole round', () => {
    const awards = computeMinigolfXpAwards(
      [
        makePlayer('a', [3, 4]),
        makePlayer('b', [4, 4]),
        makePlayer('c', [5, 5]),
      ],
      18,
    );
    expect(awards.get('a')).toBe(40);
    expect(awards.get('b')).toBe(20);
    expect(awards.get('c')).toBeUndefined();
  });

  it('awards both first-place players when tied', () => {
    const awards = computeMinigolfXpAwards(
      [
        makePlayer('a', [3, 3]),
        makePlayer('b', [3, 3]),
        makePlayer('c', [5, 5]),
      ],
      9,
    );
    expect(awards.get('a')).toBe(20);
    expect(awards.get('b')).toBe(20);
    expect(awards.get('c')).toBeUndefined();
  });

  it('awards both second-place players when tied for second', () => {
    const awards = computeMinigolfXpAwards(
      [
        makePlayer('a', [3, 3]),
        makePlayer('b', [4, 4]),
        makePlayer('c', [4, 4]),
      ],
      9,
    );
    expect(awards.get('a')).toBe(20);
    expect(awards.get('b')).toBe(10);
    expect(awards.get('c')).toBe(10);
  });

  it('shares scaled xp when tied for first on an 18-hole round', () => {
    const awards = computeMinigolfXpAwards(
      [
        makePlayer('a', [3, 3]),
        makePlayer('b', [3, 3]),
        makePlayer('c', [5, 5]),
      ],
      18,
    );
    expect(awards.get('a')).toBe(40);
    expect(awards.get('b')).toBe(40);
    expect(awards.get('c')).toBeUndefined();
  });

  it('awards solo player first place', () => {
    const awards = computeMinigolfXpAwards([makePlayer('solo', [2, 3])], 9);
    expect(awards.get('solo')).toBe(20);
  });
});
