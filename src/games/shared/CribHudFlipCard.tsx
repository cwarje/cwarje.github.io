import { motion } from 'framer-motion';
import type { Card, Suit } from '../cross-crib/types';

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<Suit, string> = {
  hearts: 'text-red-400',
  diamonds: 'text-red-400',
  clubs: 'text-gray-800',
  spades: 'text-gray-800',
};

export const CRIB_HUD_FLIP_DURATION_MS = 450;
const CRIB_HUD_FLIP_DURATION_S = CRIB_HUD_FLIP_DURATION_MS / 1000;

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

export function CribHudFlipCard({ card, faceUp }: { card: Card; faceUp: boolean }) {
  return (
    <div className="poker-cardFlip poker-cardFlip--sm crosscrib-cribHudFlip">
      <motion.div
        className="poker-cardFlipInner"
        initial={faceUp ? false : { rotateY: 0 }}
        animate={{ rotateY: faceUp ? 180 : 0 }}
        transition={{ duration: CRIB_HUD_FLIP_DURATION_S, ease: 'easeInOut' }}
      >
        <div className="poker-cardFlipBack" aria-hidden="true" />
        <div className="poker-cardFlipFront">
          <div className="poker-cardCorner">
            <span className={`poker-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
            <span className={`poker-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
