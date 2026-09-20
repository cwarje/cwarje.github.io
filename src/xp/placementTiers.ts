import { buildPlacementTiers } from './placement';

/** Score-based games where lower is better (Hearts, Golf, Minigolf strokes, etc.). */
export function tiersByScoreAsc(
  players: { id: string; score: number }[],
): string[][] {
  return buildPlacementTiers(
    players.map((p) => ({ id: p.id, score: p.score })),
    'asc',
  );
}

/** Score-based games where higher is better (Yahtzee, Farkle, chips, etc.). */
export function tiersByScoreDesc(
  players: { id: string; score: number }[],
): string[][] {
  return buildPlacementTiers(
    players.map((p) => ({ id: p.id, score: p.score })),
    'desc',
  );
}
