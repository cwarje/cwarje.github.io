import { AnimatePresence, motion } from 'framer-motion';
import type { DealFlight, DealPoint } from './useDealAnimation';
import { CardBack } from './ui/CardBack';

interface DealAnimationLayerProps {
  flights: DealFlight[];
  dealCenter: DealPoint | null;
  /** Number of cards left to deal, used to size the depleting center stack. */
  remaining: number;
  isShuffling?: boolean;
}

const STACK_MAX_CARDS = 5;
const CARD_HALF_WIDTH = 32;
const CARD_HALF_HEIGHT = 45;

export function DealAnimationLayer({
  flights,
  dealCenter,
  remaining,
  isShuffling = false,
}: DealAnimationLayerProps) {
  if (!dealCenter || (!isShuffling && flights.length === 0)) return null;

  const stackCount = isShuffling
    ? STACK_MAX_CARDS
    : Math.max(0, Math.min(STACK_MAX_CARDS, remaining));

  return (
    <div className="deal-animLayer" aria-hidden="true">
      {stackCount > 0 && (
        <div
          className="deal-animCenter"
          style={{
            left: dealCenter.x,
            top: dealCenter.y - CARD_HALF_HEIGHT,
            transform: 'translate(-50%, 0)',
          }}
        >
          <div className={`deal-animStack${isShuffling ? ' deal-animStack--shuffling' : ''}`}>
            {Array.from({ length: stackCount }, (_, i) => (
              <div
                key={`deal-stack-${i}`}
                className="deal-animCard"
                style={{ transform: `translate(${i * -1.5}px, ${i * -1.5}px)` }}
              >
                <CardBack />
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {flights.map(flight => {
          const deltaX = flight.end.x - flight.start.x;
          const deltaY = flight.end.y - flight.start.y;
          return (
            <motion.div
              key={flight.id}
              className="deal-animCard deal-animCard--flight"
              style={{ left: flight.start.x - CARD_HALF_WIDTH, top: flight.start.y - CARD_HALF_HEIGHT }}
              initial={{ x: 0, y: 0, scale: 0.7, opacity: 0, rotate: -4 }}
              animate={{
                x: deltaX,
                y: deltaY,
                scale: [0.7, 1, 1, 0.92],
                opacity: [0, 1, 1, 0],
                rotate: deltaX >= 0 ? 8 : -8,
              }}
              transition={{
                delay: flight.delay,
                duration: flight.duration,
                ease: [0.22, 1, 0.36, 1],
                opacity: { delay: flight.delay, duration: flight.duration, times: [0, 0.18, 0.82, 1] },
                scale: { delay: flight.delay, duration: flight.duration, times: [0, 0.18, 0.82, 1] },
              }}
            >
              <CardBack />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {stackCount > 0 && (
        <img
          src="/dealer.png"
          alt=""
          className={`deal-animDealer${isShuffling ? ' deal-animDealer--shuffling' : ''}`}
          style={{
            left: dealCenter.x,
            top: dealCenter.y - CARD_HALF_HEIGHT - 6,
            transform: 'translate(-50%, -100%) translateX(-6px)',
          }}
        />
      )}
    </div>
  );
}

export default DealAnimationLayer;
