import type { TwelveState, Suit } from './types';
import type { GameHudProps } from '../registry';

const suitSymbols: Record<Suit, string> = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const suitColors: Record<Suit, string> = { hearts: 'text-red-400', diamonds: 'text-red-400', clubs: 'text-gray-800', spades: 'text-gray-800' };

export default function TwelveToolbarExtra({ state }: GameHudProps) {
  const s = state as TwelveState;
  if (!s.trumpSuit) return null;
  return (
    <div className="river-hudTrumpCard">
      <div className="river-card river-card--compact">
        <div className="river-cardCorner">
          <span className={`river-cardSuit ${suitColors[s.trumpSuit]}`}>{suitSymbols[s.trumpSuit]}</span>
        </div>
      </div>
    </div>
  );
}
