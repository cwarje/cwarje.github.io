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

  return (
    <div className="backgammon-titleExtra">
      <span>
        {s.players[0]?.name}: {s.off.white} off · {s.players[1]?.name}: {s.off.black} off
      </span>
      {turnLabel && <span className="backgammon-titleExtra-turn">{turnLabel}</span>}
    </div>
  );
}
