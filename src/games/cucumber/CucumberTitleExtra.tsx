import type { CucumberState } from './types';
import type { GameHudProps } from '../registry';

export default function CucumberTitleExtra({ state }: GameHudProps) {
  const s = state as CucumberState;
  return (
    <p className="text-xs sm:text-sm text-white/80">Game ends at {s.eliminationThreshold} pts</p>
  );
}
