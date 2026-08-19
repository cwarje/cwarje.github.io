import type { GameHudProps } from '../registry';
import type { BackgammonState } from './types';

export default function BackgammonTitleExtra({ state, myId }: GameHudProps) {
  const s = state as BackgammonState;
  const current = s.players[s.currentPlayerIndex];
  const isMyTurn = current?.id === myId;

  const turnLabel =
    s.phase === 'finished' || !current
      ? null
      : isMyTurn
        ? s.phase === 'pre-roll'
          ? 'Your roll'
          : 'Your move'
        : `${current.name}'s turn`;

  const matchScoreLabel =
    s.matchFormat === 'best-of-3'
      ? `${s.players[0]?.name}: ${s.matchWins[s.players[0]?.id ?? ''] ?? 0} · ${s.players[1]?.name}: ${s.matchWins[s.players[1]?.id ?? ''] ?? 0}`
      : `${s.players[0]?.name}: ${s.off.white} off · ${s.players[1]?.name}: ${s.off.black} off`;

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-xs sm:text-sm text-white/80">{matchScoreLabel}</p>
      {turnLabel && <p className="text-xs sm:text-sm text-white/80">{turnLabel}</p>}
    </div>
  );
}
