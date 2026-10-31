import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Card } from './types';
import { FLY_EASE } from './casinoAnimMetrics';
import type { CasinoPlayFlight, CasinoPlayAnimation } from './useCasinoPlayAnimation';

interface CasinoPlayAnimationLayerProps {
  animation: CasinoPlayAnimation | null;
  renderCardFace: (card: Card) => ReactNode;
  onAnimationComplete?: () => void;
}

function FlyingCard({
  flight,
  renderCardFace,
  onAnimationComplete,
}: {
  flight: CasinoPlayFlight;
  renderCardFace: (card: Card) => ReactNode;
  onAnimationComplete?: () => void;
}) {
  const deltaX = flight.to.x - flight.from.x;
  const deltaY = flight.to.y - flight.from.y;

  return (
    <motion.div
      className="casino-playAnimCard"
      style={{
        left: flight.from.x - flight.width / 2,
        top: flight.from.y - flight.height / 2,
        width: flight.width,
        height: flight.height,
      }}
      initial={{ x: 0, y: 0, opacity: 1 }}
      animate={{ x: deltaX, y: deltaY, opacity: 1 }}
      transition={{
        delay: flight.delayMs / 1000,
        duration: flight.durationMs / 1000,
        ease: FLY_EASE,
      }}
      onAnimationComplete={onAnimationComplete}
    >
      {renderCardFace(flight.card)}
    </motion.div>
  );
}

export function CasinoPlayAnimationLayer({
  animation,
  renderCardFace,
  onAnimationComplete,
}: CasinoPlayAnimationLayerProps) {
  if (!animation || animation.flights.length === 0) return null;

  const lastFlightEndMs = animation.flights.reduce(
    (max, flight) => Math.max(max, flight.delayMs + flight.durationMs),
    0,
  );

  return (
    <div className="casino-playAnimLayer" aria-hidden="true">
      {animation.flights.map(flight => {
        const isLast = flight.delayMs + flight.durationMs === lastFlightEndMs;
        return (
          <FlyingCard
            key={flight.id}
            flight={flight}
            renderCardFace={renderCardFace}
            onAnimationComplete={isLast ? onAnimationComplete : undefined}
          />
        );
      })}
    </div>
  );
}
