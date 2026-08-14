import type { TensState } from './types';
import type { GameHudProps } from '../registry';

export default function TensTitleExtra({ state }: GameHudProps) {
  const s = state as TensState;
  return (
    <div className="text-xs sm:text-sm text-white/80 leading-snug">
      <p>Round {s.roundNumber}</p>
      <p>Game to {s.scoreThreshold}</p>
    </div>
  );
}
