import type { MinigolfHoleCount } from '../../networking/types';
import type { MinigolfPlayer } from './types';
import {
  XP_PER_LEVEL,
  getLevel,
  getLevelProgress,
  isDoubleXpWeekend,
  readPlayerXp,
  writePlayerXp,
  type LevelProgress,
} from '../../xp/progress';
import { buildPlacementTiers, computeTieredPlacementAwards } from '../../xp/placement';

export const MINIGOLF_XP_STORAGE_KEY = 'minigolfXp';
export const MINIGOLF_XP_BY_HOLE_COUNT: Record<
  MinigolfHoleCount,
  { first: number; second: number }
> = {
  3: { first: 10, second: 5 },
  9: { first: 20, second: 10 },
  18: { first: 40, second: 20 },
};
export const MINIGOLF_XP_PER_LEVEL = XP_PER_LEVEL;
export const MINIGOLF_XP_OBSTACLES_BONUS = 5;

export type MinigolfLevelProgress = LevelProgress;

function playerTotalStrokes(p: MinigolfPlayer): number {
  return p.scores.reduce((sum, score) => sum + (score ?? 0), 0);
}

export function readMinigolfXp(): number {
  return readPlayerXp();
}

export function writeMinigolfXp(xp: number): void {
  writePlayerXp(xp);
}

export function getMinigolfLevel(xp: number): number {
  return getLevel(xp);
}

export function getMinigolfLevelProgress(xp: number): MinigolfLevelProgress {
  return getLevelProgress(xp);
}

export function isMinigolfDoubleXpWeekend(date: Date = new Date()): boolean {
  return isDoubleXpWeekend(date);
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
  options?: { at?: Date },
): Map<string, number> {
  if (players.length === 0) return new Map();

  const entries = players.map((p) => ({
    id: p.id,
    score: playerTotalStrokes(p),
  }));
  const tiers = buildPlacementTiers(entries, 'asc');
  const amounts = getMinigolfPlacementXp(holeCount, obstaclesEnabled);
  return computeTieredPlacementAwards(tiers, amounts, options);
}
