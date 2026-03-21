import type { TwelveState, Suit } from './types';
import type { GameHudProps } from '../registry';

const suitSymbols: Record<Suit, string> = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const suitColors: Record<Suit, string> = { hearts: 'text-red-400', diamonds: 'text-red-400', clubs: 'text-gray-800', spades: 'text-gray-800' };

export default function TwelveToolbarExtra({ state, isHandZoomed }: GameHudProps) {
  const s = state as TwelveState;
  const displaySuit =
    s.phase === 'announcement' && s.announcement && 'suit' in s.announcement
      ? s.announcement.suit
      : s.trumpSuit;
  if (!displaySuit) return null;
  return (
    <div className={`river-hudTrumpCard ${isHandZoomed ? 'river-hudTrumpCard--zoom' : ''}`}>
      <div className="river-card river-card--compact">
        <div className="river-cardCorner">
          <span className={`river-cardSuit ${suitColors[displaySuit]}`}>{suitSymbols[displaySuit]}</span>
        </div>
      </div>
    </div>
  );
}
