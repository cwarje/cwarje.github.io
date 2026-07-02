import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Card } from './types';
import type { GolfFlipAnimation } from './useGolfFlipAnimation';
import { FLIP_DURATION_MS } from './golfAnimMetrics';

interface GolfFlipAnimationLayerProps {
  animation: GolfFlipAnimation | null;
  renderCardFace: (card: Card) => ReactNode;
}

function FlipCard({ card, renderCardFace }: { card: Card; renderCardFace: (card: Card) => ReactNode }) {
  return (
    <div className="poker-cardFlip poker-cardFlip--sm golf-discardAnimFlip">
      <motion.div
        className="poker-cardFlipInner"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: FLIP_DURATION_MS / 1000, ease: 'easeInOut' }}
      >
        <div className="poker-cardFlipBack" aria-hidden="true">
          <div className="twelve-cardBackFace" />
        </div>
        <div className="poker-cardFlipFront">{renderCardFace(card)}</div>
      </motion.div>
    </div>
  );
}

export function GolfFlipAnimationLayer({ animation, renderCardFace }: GolfFlipAnimationLayerProps) {
  if (!animation) return null;

  const { slotFrom, slotWidth, slotHeight, card } = animation;

  return (
    <div className="golf-discardAnimLayer" aria-hidden="true">
      <div
        className="golf-discardAnimCard"
        style={{
          left: slotFrom.x - slotWidth / 2,
          top: slotFrom.y - slotHeight / 2,
          width: slotWidth,
          height: slotHeight,
        }}
      >
        <FlipCard card={card} renderCardFace={renderCardFace} />
      </div>
    </div>
  );
}
