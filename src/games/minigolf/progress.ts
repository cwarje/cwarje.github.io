import type { MinigolfHoleCount } from '../../networking/types';
import type { MinigolfPlayer } from './types';

export const MINIGOLF_XP_STORAGE_KEY = 'minigolfXp';
export const MINIGOLF_XP_BY_HOLE_COUNT: Record<
  MinigolfHoleCount,
  { first: number; second: number }
> = {
  3: { first: 10, second: 5 },
  9: { first: 20, second: 10 },
  18: { first: 40, second: 20 },
};
export const MINIGOLF_XP_PER_LEVEL = 100;
export const MINIGOLF_XP_OBSTACLES_BONUS = 5;

export interface MinigolfLevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

function playerTotalStrokes(p: MinigolfPlayer): number {
  return p.scores.reduce((sum, score) => sum + (score ?? 0), 0);
}

function normalizeXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 0;
  return Math.floor(xp);
}

export function readMinigolfXp(): number {
  try {
    const raw = localStorage.getItem(MINIGOLF_XP_STORAGE_KEY);
    if (raw == null) return 0;
    return normalizeXp(Number.parseInt(raw, 10));
  } catch {
    return 0;
  }
}

export function writeMinigolfXp(xp: number): void {
  localStorage.setItem(MINIGOLF_XP_STORAGE_KEY, String(normalizeXp(xp)));
}

export function getMinigolfLevel(xp: number): number {
  return Math.floor(normalizeXp(xp) / MINIGOLF_XP_PER_LEVEL) + 1;
}

export function getMinigolfLevelProgress(xp: number): MinigolfLevelProgress {
  const normalized = normalizeXp(xp);
  const level = getMinigolfLevel(normalized);
  const xpIntoLevel = normalized % MINIGOLF_XP_PER_LEVEL;
  return {
    level,
    xpIntoLevel,
    xpForNextLevel: MINIGOLF_XP_PER_LEVEL,
  };
}

function getMinigolfPlacementXp(
  holeCount: number,
  obstaclesEnabled: boolean,
): { first: number; second: number } {
  const base =
    MINIGOLF_XP_BY_HOLE_COUNT[holeCount as MinigolfHoleCount] ?? MINIGOLF_XP_BY_HOLE_COUNT[9];
  if (!obstaclesEnabled) return base;
  return {
    first: base.first + MINIGOLF_XP_OBSTACLES_BONUS,
    second: base.second + MINIGOLF_XP_OBSTACLES_BONUS,
  };
}

export function computeMinigolfXpAwards(
  players: MinigolfPlayer[],
  holeCount: number,
  obstaclesEnabled = false,
): Map<string, number> {
  const awards = new Map<string, number>();
  if (players.length === 0) return awards;

  const sorted = [...players].sort((a, b) => playerTotalStrokes(a) - playerTotalStrokes(b));
  const tiers: { total: number; ids: string[] }[] = [];

  for (const player of sorted) {
    const total = playerTotalStrokes(player);
    const lastTier = tiers[tiers.length - 1];
    if (lastTier && lastTier.total === total) {
      lastTier.ids.push(player.id);
    } else {
      tiers.push({ total, ids: [player.id] });
    }
  }

  const { first, second } = getMinigolfPlacementXp(holeCount, obstaclesEnabled);
  const tierXp = [first, second];
  if (tiers[0]) {
    for (const id of tiers[0].ids) {
      awards.set(id, tierXp[0]);
    }
  }
  if (tiers[1] && tiers[0].ids.length === 1) {
    for (const id of tiers[1].ids) {
      awards.set(id, tierXp[1]);
    }
  }

  return awards;
}
