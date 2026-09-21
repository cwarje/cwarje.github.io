import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CardBack } from './CardBack';

const OPPONENT_HAND_CARD_WIDTH = 45;
const OPPONENT_HAND_CARD_HEIGHT = 68;
const OPPONENT_HAND_MAX_SPREAD = 160;

export interface OpponentHandLayout {
  cardWidth: number;
  cardHeight: number;
  step: number;
  spreadWidth: number;
}

export function getOpponentHandLayout(cardCount: number): OpponentHandLayout {
  const cardWidth = OPPONENT_HAND_CARD_WIDTH;
  const cardHeight = OPPONENT_HAND_CARD_HEIGHT;
  const defaultStep = Math.round(cardWidth * 0.58);
  const fitStep = cardCount > 1 ? (OPPONENT_HAND_MAX_SPREAD - cardWidth) / (cardCount - 1) : defaultStep;
  const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
  const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
  return { cardWidth, cardHeight, step, spreadWidth };
}

export interface OpponentHandFanProps {
  playerId: string;
  playerName: string;
  fullCount: number;
  revealedCount: number;
}

export function OpponentHandFan({
  playerId,
  playerName,
  fullCount,
  revealedCount: cardCount,
}: OpponentHandFanProps) {
  const reduceMotion = useReducedMotion();

  if (cardCount === 0) return null;

  const layout = getOpponentHandLayout(cardCount);

  return (
    <div className="radial-opponentHandAnchor">
      <div
        className="radial-opponentHandSpread"
        aria-label={`${playerName}, ${fullCount} cards in hand`}
        style={{
          width: `${layout.spreadWidth}px`,
          height: `${layout.cardHeight}px`,
          transition: 'width 0.16s ease',
        }}
      >
        <AnimatePresence initial={false}>
          {Array.from({ length: cardCount }, (_, i) => {
            const isLast = i === cardCount - 1;
            const hitboxWidth = isLast ? layout.cardWidth : layout.step;
            return (
              <motion.div
                key={`${playerId}-hand-slot-${i}`}
                className="radial-opponentHandHitbox"
                style={{
                  position: 'absolute',
                  left: `${i * layout.step}px`,
                  width: `${hitboxWidth}px`,
                  height: `${layout.cardHeight}px`,
                  zIndex: i + 1,
                }}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 12, scale: 0.85 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
              <span
                className="radial-opponentHandCardWrap"
                style={{ width: `${layout.cardWidth}px`, height: `${layout.cardHeight}px` }}
              >
                <CardBack />
              </span>
            </motion.div>
          );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
