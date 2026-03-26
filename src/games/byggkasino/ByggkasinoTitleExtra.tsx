import type { ByggkasinoState } from './types';
import type { GameHudProps } from '../registry';

export default function ByggkasinoTitleExtra({ state }: GameHudProps) {
  const s = state as ByggkasinoState;

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-xs sm:text-sm text-white/80">
        Round {s.roundNumber} &middot; Target {s.targetScore}
      </p>
      <p className="text-xs text-white/50">
        {s.deck.length} cards in deck &middot; {s.tableItems.length} on table
      </p>
    </div>
  );
}
