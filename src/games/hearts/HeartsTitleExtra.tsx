import type { HeartsState } from './types';
import type { GameHudProps } from '../registry';

export default function HeartsTitleExtra({ state }: GameHudProps) {
  const s = state as HeartsState;
  return (
    <>
      <p className="text-xs sm:text-sm text-white/80">Game to {s.targetScore ?? 100}</p>
      {s.heartsBroken && (
        <p className="text-xs sm:text-sm text-white/80">
          <span className="text-red-400">♥</span> broken
        </p>
      )}
    </>
  );
}
