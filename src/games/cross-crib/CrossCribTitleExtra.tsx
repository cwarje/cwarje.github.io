import type { CrossCribState } from './types';
import type { GameHudProps } from '../registry';

export default function CrossCribTitleExtra({ state }: GameHudProps) {
  const s = state as CrossCribState;
  return (
    <p className="text-xs sm:text-sm text-white/80">
      Round {s.roundNumber}/4
    </p>
  );
}
