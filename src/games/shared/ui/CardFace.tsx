import type { CardLike } from './cardConstants';
import { SUIT_COLORS, SUIT_SYMBOLS, rankDisplay } from './cardConstants';

interface CardFaceProps {
  card: CardLike;
  disabled?: boolean;
  selected?: boolean;
  compact?: boolean;
  received?: boolean;
  className?: string;
}

export function CardFace({
  card,
  disabled = false,
  selected = false,
  compact = false,
  received = false,
  className = '',
}: CardFaceProps) {
  return (
    <div
      className={[
        'card-face',
        disabled ? 'card-face--disabled' : '',
        selected ? 'card-face--selected' : '',
        compact ? 'card-face--compact' : '',
        received ? 'card-face--received' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="card-faceCorner">
        <span className={`card-faceRank ${SUIT_COLORS[card.suit as keyof typeof SUIT_COLORS]}`}>
          {rankDisplay(card.rank)}
        </span>
        <span className={`card-faceSuit ${SUIT_COLORS[card.suit as keyof typeof SUIT_COLORS]}`}>
          {SUIT_SYMBOLS[card.suit as keyof typeof SUIT_SYMBOLS]}
        </span>
      </div>
    </div>
  );
}
