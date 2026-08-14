import type { TensState } from './types';
import type { GameHudProps } from '../registry';
import { deckCountForPlayers } from './rules';

export default function TensTitleExtra({ state }: GameHudProps) {
  const s = state as TensState;
  const deckCount = deckCountForPlayers(s.players.length);
  const deckLabel = deckCount === 1 ? '1 deck' : `${deckCount} decks`;

  return (
    <div className="text-xs sm:text-sm text-white/80 leading-snug">
      <p>{deckLabel}</p>
      <p>Round {s.roundNumber}</p>
      <p>Game to {s.scoreThreshold}</p>
    </div>
  );
}
