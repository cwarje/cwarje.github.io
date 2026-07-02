import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Card } from './types';
import type { GolfSwapAnimation } from './useGolfSwapAnimation';
import { FLIP_DURATION_MS, FLY_DURATION_MS } from './golfAnimMetrics';

interface GolfSwapAnimationLayerProps {
  animation: GolfSwapAnimation | null;
  renderCardFace: (card: Card) => ReactNode;
}

const flyTransition = { duration: FLY_DURATION_MS / 1000, ease: [0.22, 1, 0.36, 1] as const };

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

function CardBack() {
  return <div className="twelve-cardBackFace" />;
}

export function GolfSwapAnimationLayer({ animation, renderCardFace }: GolfSwapAnimationLayerProps) {
  if (!animation) return null;

  if (animation.phase === 'flipSlot') {
    const {
      slotFrom,
      slotWidth,
      slotHeight,
      replacedCard,
      drawnFrom,
      pileWidth,
      pileHeight,
      drawnCard,
      showDrawnFace,
    } = animation;
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
          <FlipCard card={replacedCard} renderCardFace={renderCardFace} />
        </div>

        <div
          className="golf-discardAnimCard"
          style={{
            left: drawnFrom.x - pileWidth / 2,
            top: drawnFrom.y - pileHeight / 2,
            width: pileWidth,
            height: pileHeight,
          }}
        >
          {showDrawnFace ? renderCardFace(drawnCard) : <CardBack />}
        </div>
      </div>
    );
  }

  const {
    slotFrom,
    discardTo,
    slotWidth,
    slotHeight,
    replacedCard,
    drawnFrom,
    drawnTo,
    pileWidth,
    pileHeight,
    drawnCard,
    showDrawnFace,
  } = animation;

  const toDiscardX = discardTo.x - slotFrom.x;
  const toDiscardY = discardTo.y - slotFrom.y;
  const toSlotX = drawnTo.x - drawnFrom.x;
  const toSlotY = drawnTo.y - drawnFrom.y;

  return (
    <div className="golf-discardAnimLayer" aria-hidden="true">
      <motion.div
        className="golf-discardAnimCard"
        style={{
          left: slotFrom.x - slotWidth / 2,
          top: slotFrom.y - slotHeight / 2,
          width: slotWidth,
          height: slotHeight,
        }}
        initial={{ x: 0, y: 0 }}
        animate={{ x: toDiscardX, y: toDiscardY }}
        transition={flyTransition}
      >
        {renderCardFace(replacedCard)}
      </motion.div>

      <motion.div
        className="golf-discardAnimCard"
        style={{
          left: drawnFrom.x - pileWidth / 2,
          top: drawnFrom.y - pileHeight / 2,
          width: pileWidth,
          height: pileHeight,
        }}
        initial={{ x: 0, y: 0 }}
        animate={{ x: toSlotX, y: toSlotY }}
        transition={flyTransition}
      >
        {showDrawnFace ? renderCardFace(drawnCard) : <CardBack />}
      </motion.div>
    </div>
  );
}
