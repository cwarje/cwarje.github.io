import { TOTAL_HOLES, type GolfState } from './types';
import type { GameHudProps } from '../registry';

export default function GolfTitleExtra({ state }: GameHudProps) {
  const s = state as GolfState;
  if (s.phase === 'game-over') return null;

  return (
    <div className="mt-1 text-[10px] sm:text-xs text-white/90 leading-snug">
      <span className="font-semibold">Hole {s.holeNumber}/{TOTAL_HOLES}</span>
    </div>
  );
}
