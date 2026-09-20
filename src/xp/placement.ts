import { isDoubleXpWeekend } from './progress';

export type ScoreOrder = 'asc' | 'desc';

export interface PlacementEntry {
  id: string;
  score: number;
}

export function buildPlacementTiers(
  entries: PlacementEntry[],
  order: ScoreOrder,
): string[][] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) =>
    order === 'asc' ? a.score - b.score : b.score - a.score,
  );

  const tiers: { score: number; ids: string[] }[] = [];
  for (const entry of sorted) {
    const lastTier = tiers[tiers.length - 1];
    if (lastTier && lastTier.score === entry.score) {
      lastTier.ids.push(entry.id);
    } else {
      tiers.push({ score: entry.score, ids: [entry.id] });
    }
  }

  return tiers.map((t) => t.ids);
}

export function computeTieredPlacementAwards(
  tiers: string[][],
  amounts: { first: number; second: number },
  options?: { at?: Date },
): Map<string, number> {
  const awards = new Map<string, number>();
  if (tiers.length === 0) return awards;

  let { first, second } = amounts;
  if (isDoubleXpWeekend(options?.at)) {
    first *= 2;
    second *= 2;
  }

  const tierXp = [first, second];
  if (tiers[0]) {
    for (const id of tiers[0]) {
      awards.set(id, tierXp[0]);
    }
  }
  if (tiers[1] && tiers[0]?.length === 1) {
    for (const id of tiers[1]) {
      awards.set(id, tierXp[1]);
    }
  }

  return awards;
}
