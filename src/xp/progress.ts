export const PLAYER_XP_STORAGE_KEY = 'playerXp';
const LEGACY_MINIGOLF_XP_STORAGE_KEY = 'minigolfXp';

export const XP_PER_LEVEL = 100;

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

function normalizeXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 0;
  return Math.floor(xp);
}

function readLegacyMinigolfXp(): number {
  try {
    const raw = localStorage.getItem(LEGACY_MINIGOLF_XP_STORAGE_KEY);
    if (raw == null) return 0;
    return normalizeXp(Number.parseInt(raw, 10));
  } catch {
    return 0;
  }
}

export function readPlayerXp(): number {
  try {
    const raw = localStorage.getItem(PLAYER_XP_STORAGE_KEY);
    if (raw != null) {
      return normalizeXp(Number.parseInt(raw, 10));
    }
    const legacy = readLegacyMinigolfXp();
    if (legacy > 0) {
      writePlayerXp(legacy);
      localStorage.removeItem(LEGACY_MINIGOLF_XP_STORAGE_KEY);
    }
    return legacy;
  } catch {
    return 0;
  }
}

export function writePlayerXp(xp: number): void {
  localStorage.setItem(PLAYER_XP_STORAGE_KEY, String(normalizeXp(xp)));
}

export function getLevel(xp: number): number {
  return Math.floor(normalizeXp(xp) / XP_PER_LEVEL) + 1;
}

export function getLevelProgress(xp: number): LevelProgress {
  const normalized = normalizeXp(xp);
  const level = getLevel(normalized);
  const xpIntoLevel = normalized % XP_PER_LEVEL;
  return {
    level,
    xpIntoLevel,
    xpForNextLevel: XP_PER_LEVEL,
  };
}

export function isDoubleXpWeekend(date: Date = new Date()): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}
