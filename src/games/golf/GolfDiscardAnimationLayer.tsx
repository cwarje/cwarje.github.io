import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Card } from './types';
import type { GolfDiscardAnimation } from './useGolfDiscardAnimation';
import { FLY_DURATION_MS, FLIP_DURATION_MS } from './useGolfDiscardAnimation';

interface GolfDiscardAnimationLayerProps {
  animation: GolfDiscardAnimation | null;
  renderCardFace: (card: Card) => ReactNode;
}

function FlipAtStock({ card, renderCardFace }: { card: Card; renderCardFace: (card: Card) => ReactNode }) {
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

export function GolfDiscardAnimationLayer({ animation, renderCardFace }: GolfDiscardAnimationLayerProps) {
  if (!animation) return null;

  const { card, from, to, phase, width, height } = animation;
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;

  return (
    <div className="golf-discardAnimLayer" aria-hidden="true">
      <motion.div
        className="golf-discardAnimCard"
        style={{
          left: from.x - width / 2,
          top: from.y - height / 2,
          width,
          height,
        }}
        initial={{ x: 0, y: 0 }}
        animate={{ x: phase === 'fly' ? deltaX : 0, y: phase === 'fly' ? deltaY : 0 }}
        transition={
          phase === 'fly'
            ? { duration: FLY_DURATION_MS / 1000, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0 }
        }
      >
        {phase === 'flip' ? (
          <FlipAtStock card={card} renderCardFace={renderCardFace} />
        ) : (
          renderCardFace(card)
        )}
      </motion.div>
    </div>
  );
}
