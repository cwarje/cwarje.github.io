import { describe, it, expect, beforeEach } from 'vitest';
import {
  SELECTED_HAT_STORAGE_KEY,
  countUnlockedWearableHats,
  isHatUnlocked,
  readSelectedHat,
  sanitizeSelectedHat,
  writeSelectedHat,
} from './hats';

describe('hats', () => {
  beforeEach(() => {
    localStorage.removeItem(SELECTED_HAT_STORAGE_KEY);
  });

  it('unlocks party at any level and tier hats every 10 levels', () => {
    expect(isHatUnlocked('party', 1)).toBe(true);
    expect(isHatUnlocked('chef', 9)).toBe(false);
    expect(isHatUnlocked('chef', 10)).toBe(true);
    expect(isHatUnlocked('captain', 19)).toBe(false);
    expect(isHatUnlocked('captain', 20)).toBe(true);
    expect(isHatUnlocked('beanie', 30)).toBe(true);
    expect(isHatUnlocked('cowboy', 39)).toBe(false);
    expect(isHatUnlocked('cowboy', 40)).toBe(true);
  });

  it('counts wearable hats at level 49', () => {
    expect(countUnlockedWearableHats(49)).toBe(5);
    expect(countUnlockedWearableHats(9)).toBe(1);
  });

  it('sanitizes locked selections to none', () => {
    expect(sanitizeSelectedHat('cowboy', 10)).toBe('none');
    expect(sanitizeSelectedHat('chef', 10)).toBe('chef');
    expect(sanitizeSelectedHat(undefined, 1)).toBe('none');
  });

  it('persists selected hat in localStorage', () => {
    expect(readSelectedHat()).toBe('none');
    writeSelectedHat('party');
    expect(readSelectedHat()).toBe('party');
  });
});
