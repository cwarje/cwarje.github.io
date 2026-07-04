import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MINIGOLF_HOST_SETTINGS,
  normalizeMinigolfHostSettings,
  readStoredMinigolfSettings,
  writeStoredMinigolfSettings,
} from './settings';

const STORAGE_KEY = 'minigolfHostSettings';

describe('minigolf settings', () => {
  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('normalizeMinigolfHostSettings returns valid settings unchanged', () => {
    const settings = {
      minigolfHoleCount: 18 as const,
      minigolfTheme: 'random' as const,
      minigolfBallCollisions: true,
      minigolfObstacles: true,
    };
    expect(normalizeMinigolfHostSettings(settings)).toEqual(settings);
  });

  it('normalizeMinigolfHostSettings defaults invalid or missing fields', () => {
    expect(normalizeMinigolfHostSettings(null)).toEqual(DEFAULT_MINIGOLF_HOST_SETTINGS);
    expect(normalizeMinigolfHostSettings({})).toEqual(DEFAULT_MINIGOLF_HOST_SETTINGS);
    expect(
      normalizeMinigolfHostSettings({
        minigolfHoleCount: 12,
        minigolfTheme: 'jungle',
        minigolfBallCollisions: 'yes',
        minigolfObstacles: 1,
      }),
    ).toEqual(DEFAULT_MINIGOLF_HOST_SETTINGS);
  });

  it('normalizeMinigolfHostSettings keeps valid fields and defaults invalid ones', () => {
    expect(
      normalizeMinigolfHostSettings({
        minigolfHoleCount: 3,
        minigolfTheme: 'desert',
      }),
    ).toEqual({
      minigolfHoleCount: 3,
      minigolfTheme: 'classic',
      minigolfBallCollisions: false,
      minigolfObstacles: false,
    });
  });

  it('readStoredMinigolfSettings reads from localStorage', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        minigolfHoleCount: 18,
        minigolfTheme: 'tundra',
        minigolfBallCollisions: true,
        minigolfObstacles: false,
      }),
    );
    expect(readStoredMinigolfSettings()).toEqual({
      minigolfHoleCount: 18,
      minigolfTheme: 'classic',
      minigolfBallCollisions: true,
      minigolfObstacles: false,
    });
  });

  it('readStoredMinigolfSettings defaults when localStorage is empty', () => {
    expect(readStoredMinigolfSettings()).toEqual(DEFAULT_MINIGOLF_HOST_SETTINGS);
  });

  it('readStoredMinigolfSettings defaults on corrupt JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(readStoredMinigolfSettings()).toEqual(DEFAULT_MINIGOLF_HOST_SETTINGS);
  });

  it('writeStoredMinigolfSettings persists normalized JSON', () => {
    writeStoredMinigolfSettings({
      minigolfHoleCount: 3,
      minigolfTheme: 'random',
      minigolfBallCollisions: true,
      minigolfObstacles: true,
    });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      minigolfHoleCount: 3,
      minigolfTheme: 'random',
      minigolfBallCollisions: true,
      minigolfObstacles: true,
    });
  });

  it('writeStoredMinigolfSettings normalizes invalid values before persisting', () => {
    writeStoredMinigolfSettings({
      minigolfHoleCount: 99 as 3,
      minigolfTheme: 'invalid' as 'classic',
      minigolfBallCollisions: true,
      minigolfObstacles: false,
    });
    expect(readStoredMinigolfSettings()).toEqual({
      minigolfHoleCount: 9,
      minigolfTheme: 'classic',
      minigolfBallCollisions: true,
      minigolfObstacles: false,
    });
  });
});
