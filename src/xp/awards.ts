import type { GameType } from '../networking/types';
import type { CribbageState } from '../games/cribbage/types';
import type { GolfState } from '../games/golf/types';
import type { MinigolfState } from '../games/minigolf/types';
import type { PokerState } from '../games/poker/types';
import { checkGameOver } from '../games/gameEngine';
import { GAME_REGISTRY } from '../games/registry';
import { computeMinigolfXpAwards } from '../games/minigolf/progress';
import { computeTieredPlacementAwards } from './placement';

export const DEFAULT_PLACEMENT_XP = { first: 20, second: 10 } as const;

export function isReadyToAwardXp(gameType: GameType, state: unknown): boolean {
  if (gameType === 'poker') {
    return (state as PokerState).sessionOver === true;
  }
  if (!checkGameOver(gameType, state)) return false;
  if (gameType === 'cribbage') {
    return (state as CribbageState).phase === 'game-over';
  }
  if (gameType === 'golf') {
    return (state as GolfState).phase === 'game-over';
  }
  return true;
}

export function computeXpAwardsForGame(
  gameType: GameType,
  state: unknown,
  options?: { at?: Date },
): Map<string, number> {
  if (gameType === 'minigolf') {
    const s = state as MinigolfState;
    return computeMinigolfXpAwards(s.players, s.courses.length, s.obstacles, options);
  }

  const getTiers = GAME_REGISTRY[gameType].getXpPlacementTiers;
  if (!getTiers) return new Map();

  const tiers = getTiers(state);
  return computeTieredPlacementAwards(tiers, DEFAULT_PLACEMENT_XP, options);
}
