import { describe, it, expect, beforeEach } from 'vitest';
import {
  SELECTED_HAT_STORAGE_KEY,
  countUnlockedWearableHats,
  getLobbyPlayerSanitizedHatId,
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
    expect(isHatUnlocked('cowboy', 9)).toBe(false);
    expect(isHatUnlocked('cowboy', 10)).toBe(true);
    expect(isHatUnlocked('chef', 19)).toBe(false);
    expect(isHatUnlocked('chef', 20)).toBe(true);
    expect(isHatUnlocked('fedora', 30)).toBe(true);
    expect(isHatUnlocked('propeller', 49)).toBe(false);
    expect(isHatUnlocked('propeller', 50)).toBe(true);
    expect(isHatUnlocked('luffy', 69)).toBe(false);
    expect(isHatUnlocked('luffy', 70)).toBe(true);
    expect(isHatUnlocked('partycowboy', 89)).toBe(false);
    expect(isHatUnlocked('partycowboy', 90)).toBe(true);
    expect(isHatUnlocked('crown', 99)).toBe(false);
    expect(isHatUnlocked('crown', 100)).toBe(true);
  });

  it('counts wearable hats at level 49', () => {
    expect(countUnlockedWearableHats(49)).toBe(5);
    expect(countUnlockedWearableHats(9)).toBe(1);
    expect(countUnlockedWearableHats(90)).toBe(10);
    expect(countUnlockedWearableHats(100)).toBe(11);
  });

  it('sanitizes locked selections to none', () => {
    expect(sanitizeSelectedHat('chef', 10)).toBe('none');
    expect(sanitizeSelectedHat('chef', 20)).toBe('chef');
    expect(sanitizeSelectedHat(undefined, 1)).toBe('none');
  });

  it('persists selected hat in localStorage', () => {
    expect(readSelectedHat()).toBe('none');
    writeSelectedHat('party');
    expect(readSelectedHat()).toBe('party');
  });

  it('resolves lobby player hat for humans and bots', () => {
    const lobby = [
      { id: 'human', xp: 2000, selectedHat: 'chef' as const },
      { id: 'bot', isBot: true, xp: 5000, selectedHat: 'cowboy' as const },
    ];
    expect(getLobbyPlayerSanitizedHatId('human', lobby)).toBe('chef');
    expect(getLobbyPlayerSanitizedHatId('bot', lobby)).toBe('none');
    expect(getLobbyPlayerSanitizedHatId('missing', lobby)).toBe('none');
  });

  it('sanitizes locked lobby hat selections', () => {
    const lobby = [{ id: 'p1', xp: 5, selectedHat: 'chef' as const }];
    expect(getLobbyPlayerSanitizedHatId('p1', lobby)).toBe('none');
  });
});
