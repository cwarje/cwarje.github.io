import type { UpRiverState, Suit } from './types';
import type { GameHudProps } from '../registry';

const suitSymbols: Record<Suit, string> = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const suitColors: Record<Suit, string> = { hearts: 'text-red-400', diamonds: 'text-red-400', clubs: 'text-gray-800', spades: 'text-gray-800' };

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

export default function UpRiverToolbarExtra({ state }: GameHudProps) {
  const s = state as UpRiverState;
  if (!s.trumpCard) return null;
  return (
    <div className="river-hudTrumpCard">
      <div className="river-card river-card--compact">
        <div className="river-cardCorner">
          <span className={`river-cardRank ${suitColors[s.trumpCard.suit]}`}>{rankDisplay(s.trumpCard.rank)}</span>
          <span className={`river-cardSuit ${suitColors[s.trumpCard.suit]}`}>{suitSymbols[s.trumpCard.suit]}</span>
        </div>
      </div>
    </div>
  );
}
