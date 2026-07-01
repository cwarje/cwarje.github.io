import type { CucumberState } from './types';
import type { GameHudProps } from '../registry';

export default function CucumberTitleExtra({ state }: GameHudProps) {
  const s = state as CucumberState;
  const activeCount = s.players.filter(player => !player.eliminated).length;
  return (
    <>
      <p className="text-xs sm:text-sm text-white/80">Elimination at {s.eliminationThreshold} pts</p>
      <p className="text-xs sm:text-sm text-white/80">
        {activeCount} player{activeCount === 1 ? '' : 's'} left
      </p>
    </>
  );
}
