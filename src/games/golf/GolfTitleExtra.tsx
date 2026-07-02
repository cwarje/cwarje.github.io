import type { GolfState } from './types';
import type { GameHudProps } from '../registry';
import { getPlayerHudTextColor } from '../../networking/playerColors';

export default function GolfTitleExtra({ state }: GameHudProps) {
  const s = state as GolfState;
  if (s.phase === 'game-over') return null;

  return (
    <div className="mt-1 text-[10px] sm:text-xs text-white/90 leading-snug">
      <span className="font-semibold">Hole {s.holeNumber}/{9}</span>
      <span className="mx-1.5">·</span>
      {s.players.map((player, index) => (
        <span key={player.id}>
          {index > 0 && <span className="mx-1">·</span>}
          <span style={{ color: getPlayerHudTextColor(player.color) }}>
            {player.name} {player.totalScore}
          </span>
        </span>
      ))}
    </div>
  );
}
