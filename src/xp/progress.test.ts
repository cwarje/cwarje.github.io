import { afterEach, describe, expect, it } from 'vitest';
import {
  PLAYER_XP_STORAGE_KEY,
  getLevel,
  getLevelProgress,
  readPlayerXp,
  writePlayerXp,
} from './progress';

const LEGACY_KEY = 'minigolfXp';

describe('player xp progress', () => {
  afterEach(() => {
    localStorage.removeItem(PLAYER_XP_STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  });

  it('migrates legacy minigolfXp to playerXp once', () => {
    localStorage.setItem(LEGACY_KEY, '77');
    expect(readPlayerXp()).toBe(77);
    expect(localStorage.getItem(PLAYER_XP_STORAGE_KEY)).toBe('77');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('reads and writes playerXp', () => {
    writePlayerXp(45);
    expect(readPlayerXp()).toBe(45);
  });

  it('derives level and progress', () => {
    expect(getLevel(0)).toBe(1);
    expect(getLevel(100)).toBe(2);
    expect(getLevelProgress(45)).toEqual({
      level: 1,
      xpIntoLevel: 45,
      xpForNextLevel: 100,
    });
  });
});
