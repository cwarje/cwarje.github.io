import type { GameType } from '../networking/types';
import { computeXpAwardsForGame, isReadyToAwardXp } from './awards';

export function getGameOverXpAwards(
  gameType: GameType,
  state: unknown,
  options?: { at?: Date },
): Map<string, number> {
  if (!isReadyToAwardXp(gameType, state)) return new Map();
  return computeXpAwardsForGame(gameType, state, options);
}

export function GameOverXpBadge({ amount }: { amount?: number }) {
  if (amount == null || amount <= 0) return null;
  return <span className="gameOver-xpBadge">+ {amount} xp</span>;
}

export function GameOverPlayerName({
  name,
  playerId,
  xpAwards,
}: {
  name: string;
  playerId: string;
  xpAwards: Map<string, number>;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{name}</span>
      <GameOverXpBadge amount={xpAwards.get(playerId)} />
    </span>
  );
}
