import { motion } from 'framer-motion';
import type { CardLike } from './cardConstants';
import { CardBack } from './CardBack';
import { CardFace } from './CardFace';

export const DEFAULT_FLIP_DURATION_MS = 450;

interface FlipCardProps {
  card?: CardLike;
  faceDown?: boolean;
  faceUp?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  skipFlip?: boolean;
  flipDurationMs?: number;
  className?: string;
  frontClassName?: string;
}

export function FlipCard({
  card,
  faceDown = false,
  faceUp,
  disabled = false,
  size = 'md',
  skipFlip = false,
  flipDurationMs = DEFAULT_FLIP_DURATION_MS,
  className = '',
  frontClassName = '',
}: FlipCardProps) {
  const showBack = faceUp !== undefined ? !faceUp : faceDown || !card;
  const sizeClass = size === 'sm' ? 'card-flip--sm' : '';

  if (showBack) {
    const backSizeClass = size === 'sm' ? 'card-back--sm' : '';
    return <CardBack className={backSizeClass} />;
  }

  if (!card) {
    return <CardBack className={size === 'sm' ? 'card-back--sm' : ''} />;
  }

  const flipDurationS = flipDurationMs / 1000;
  const initialRotate = faceUp !== undefined ? (faceUp ? false : { rotateY: 0 }) : skipFlip ? false : { rotateY: 0 };
  const animateRotate = faceUp !== undefined ? { rotateY: faceUp ? 180 : 0 } : { rotateY: 180 };
  const transition =
    faceUp !== undefined || !skipFlip
      ? { duration: flipDurationS, ease: 'easeInOut' as const }
      : undefined;

  return (
    <div className={`card-flip ${sizeClass} ${className}`.trim()}>
      <motion.div
        className="card-flipInner"
        initial={initialRotate}
        animate={animateRotate}
        transition={transition}
      >
        <div className="card-flipBack">
          <CardBack />
        </div>
        <div className={`card-flipFront ${frontClassName}`.trim()}>
          <CardFace card={card} disabled={disabled} compact={size === 'sm'} />
        </div>
      </motion.div>
    </div>
  );
}
