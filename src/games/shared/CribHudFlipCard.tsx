import type { Card } from '../cross-crib/types';
import { FlipCard, DEFAULT_FLIP_DURATION_MS } from './ui/FlipCard';

export const CRIB_HUD_FLIP_DURATION_MS = DEFAULT_FLIP_DURATION_MS;

export function CribHudFlipCard({ card, faceUp }: { card: Card; faceUp: boolean }) {
  return (
    <FlipCard
      card={card}
      faceUp={faceUp}
      size="sm"
      flipDurationMs={CRIB_HUD_FLIP_DURATION_MS}
      className="cribHudFlip"
    />
  );
}
