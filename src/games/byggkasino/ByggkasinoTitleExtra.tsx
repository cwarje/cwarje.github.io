import { countOccupiedTableSlots, type ByggkasinoState } from './types';
import type { GameHudProps } from '../registry';

export default function ByggkasinoTitleExtra({ state }: GameHudProps) {
  const s = state as ByggkasinoState;

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-xs sm:text-sm text-white/80">
        Round {s.roundNumber} &middot; Target {s.targetScore}
      </p>
      <p className="text-xs text-white/50">
        {s.deck.length} cards in deck &middot; {countOccupiedTableSlots(s.tableSlots)} on table
      </p>
      <div className="text-xs text-white/50 space-y-0.5">
        {s.players.map(p => (
          <p key={p.id}>
            {p.name} captured: {p.capturedCards.length}
          </p>
        ))}
      </div>
    </div>
  );
}
