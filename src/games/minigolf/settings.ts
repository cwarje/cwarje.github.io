import type { MinigolfHoleCount, MinigolfThemeOption } from '../../networking/types';
import { MINIGOLF_THEME_OPTIONS } from './themes';

const STORAGE_KEY = 'minigolfHostSettings';

const HOLE_COUNT_OPTIONS: readonly MinigolfHoleCount[] = [3, 9, 18];

export interface MinigolfHostSettings {
  minigolfHoleCount: MinigolfHoleCount;
  minigolfTheme: MinigolfThemeOption;
  minigolfBallCollisions: boolean;
  minigolfObstacles: boolean;
}

export const DEFAULT_MINIGOLF_HOST_SETTINGS: MinigolfHostSettings = {
  minigolfHoleCount: 9,
  minigolfTheme: 'classic',
  minigolfBallCollisions: false,
  minigolfObstacles: false,
};

function isMinigolfHoleCount(value: unknown): value is MinigolfHoleCount {
  return typeof value === 'number' && HOLE_COUNT_OPTIONS.includes(value as MinigolfHoleCount);
}

function isMinigolfThemeOption(value: unknown): value is MinigolfThemeOption {
  return typeof value === 'string' && MINIGOLF_THEME_OPTIONS.includes(value as MinigolfThemeOption);
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeMinigolfHostSettings(raw: unknown): MinigolfHostSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_MINIGOLF_HOST_SETTINGS };
  }

  const record = raw as Record<string, unknown>;
  return {
    minigolfHoleCount: isMinigolfHoleCount(record.minigolfHoleCount)
      ? record.minigolfHoleCount
      : DEFAULT_MINIGOLF_HOST_SETTINGS.minigolfHoleCount,
    minigolfTheme: isMinigolfThemeOption(record.minigolfTheme)
      ? record.minigolfTheme
      : DEFAULT_MINIGOLF_HOST_SETTINGS.minigolfTheme,
    minigolfBallCollisions: coerceBoolean(
      record.minigolfBallCollisions,
      DEFAULT_MINIGOLF_HOST_SETTINGS.minigolfBallCollisions,
    ),
    minigolfObstacles: coerceBoolean(
      record.minigolfObstacles,
      DEFAULT_MINIGOLF_HOST_SETTINGS.minigolfObstacles,
    ),
  };
}

export function readStoredMinigolfSettings(): MinigolfHostSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MINIGOLF_HOST_SETTINGS };
    return normalizeMinigolfHostSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MINIGOLF_HOST_SETTINGS };
  }
}

export function writeStoredMinigolfSettings(settings: MinigolfHostSettings): void {
  const normalized = normalizeMinigolfHostSettings(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
