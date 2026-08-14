import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Card } from './types';
import type { TensPlayAnimation, TensPlayFlight } from './useTensPlayAnimation';

interface TensPlayAnimationLayerProps {
  animation: TensPlayAnimation | null;
  renderCardFace: (card: Card) => ReactNode;
  centerZoom?: boolean;
  onOutcomeFlyComplete?: () => void;
}

const flyEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

function FlyingCard({
  flight,
  renderCardFace,
  onAnimationComplete,
}: {
  flight: TensPlayFlight;
  renderCardFace: (card: Card) => ReactNode;
  onAnimationComplete?: () => void;
}) {
  const deltaX = flight.to.x - flight.from.x;
  const deltaY = flight.to.y - flight.from.y;

  return (
    <motion.div
      className="tens-playAnimCard"
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
        ease: flyEase,
      }}
      onAnimationComplete={onAnimationComplete}
    >
      {renderCardFace(flight.card)}
    </motion.div>
  );
}

export function TensPlayAnimationLayer({
  animation,
  renderCardFace,
  centerZoom = false,
  onOutcomeFlyComplete,
}: TensPlayAnimationLayerProps) {
  if (!animation) return null;

  const flights =
    animation.phase === 'playFly'
      ? animation.playFlights
      : animation.phase === 'outcomeFly'
        ? animation.outcomeFlights
        : [];

  if (flights.length === 0) return null;

  const lastFlightEndMs = flights.reduce(
    (max, flight) => Math.max(max, flight.delayMs + flight.durationMs),
    0,
  );

  return (
    <div
      className={`tens-playAnimLayer${centerZoom ? ' tens-playAnimLayer--centerZoom' : ''}`}
      aria-hidden="true"
    >
      {flights.map(flight => {
        const isLastOutcomeFlight =
          animation.phase === 'outcomeFly' &&
          flight.delayMs + flight.durationMs === lastFlightEndMs;
        return (
          <FlyingCard
            key={flight.id}
            flight={flight}
            renderCardFace={renderCardFace}
            onAnimationComplete={isLastOutcomeFlight ? onOutcomeFlyComplete : undefined}
          />
        );
      })}
    </div>
  );
}
