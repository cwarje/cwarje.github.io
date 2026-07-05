import type { MinigolfPlayer } from './types';

export const MINIGOLF_XP_STORAGE_KEY = 'minigolfXp';
export const MINIGOLF_XP_FIRST = 20;
export const MINIGOLF_XP_SECOND = 10;
export const MINIGOLF_XP_PER_LEVEL = 100;

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

export function computeMinigolfXpAwards(players: MinigolfPlayer[]): Map<string, number> {
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

  const tierXp = [MINIGOLF_XP_FIRST, MINIGOLF_XP_SECOND];
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
