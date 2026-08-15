import type { GameHudProps } from '../registry';
import type { BackgammonState } from './types';

export default function BackgammonTitleExtra({ state }: GameHudProps) {
  const s = state as BackgammonState;
  const current = s.players[s.currentPlayerIndex];

  return (
    <div className="backgammon-titleExtra">
      <span>
        {s.players[0]?.name}: {s.off.white} off · {s.players[1]?.name}: {s.off.black} off
      </span>
      {s.phase !== 'finished' && current && (
        <span className="backgammon-titleExtra-turn">{current.name}&apos;s turn</span>
      )}
    </div>
  );
}
