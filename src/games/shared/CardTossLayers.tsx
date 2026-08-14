import { AnimatePresence, motion } from 'framer-motion';
import type { CardSplat, CardTossBurst, SeatCardSplat } from './useCardToss';

const CARD_TOSS_CLUSTER_OFFSETS = [
  { x: 0, y: 0, rotate: -8 },
  { x: -18, y: -12, rotate: 10 },
  { x: 16, y: 10, rotate: -16 },
  { x: -6, y: 18, rotate: 18 },
  { x: 22, y: -10, rotate: 7 },
  { x: -24, y: 8, rotate: -20 },
  { x: 7, y: -22, rotate: 22 },
  { x: 28, y: 20, rotate: -4 },
  { x: -30, y: -20, rotate: 14 },
];

interface CardTossLayersProps {
  cardTossBursts: CardTossBurst[];
  seatCardSplats: SeatCardSplat[];
  cardSplats: CardSplat[];
}

export function CardTossLayers({ cardTossBursts, seatCardSplats, cardSplats }: CardTossLayersProps) {
  return (
    <>
      <AnimatePresence>
        {cardTossBursts.map((burst) => {
          const deltaX = burst.end.x - burst.start.x;
          const deltaY = burst.end.y - burst.start.y;
          return (
            <div key={burst.id} className="card-toss-layer" aria-hidden="true">
              {Array.from({ length: burst.cardCount }, (_, i) => {
                const clusterOffset = CARD_TOSS_CLUSTER_OFFSETS[i % CARD_TOSS_CLUSTER_OFFSETS.length];
                const repeatOffset = Math.floor(i / CARD_TOSS_CLUSTER_OFFSETS.length) * 8;
                const startOffsetX = clusterOffset.x + repeatOffset;
                const startOffsetY = clusterOffset.y - repeatOffset * 0.5;
                const targetOffsetX = clusterOffset.x * 0.45;
                const targetOffsetY = clusterOffset.y * 0.45;
                return (
                  <motion.div
                    key={`${burst.id}-${i}`}
                    className="card-toss-card"
                    style={{ left: burst.start.x - 44, top: burst.start.y - 64 }}
                    initial={{
                      x: startOffsetX,
                      y: startOffsetY,
                      rotate: clusterOffset.rotate,
                      scale: 1.18,
                      opacity: 1,
                    }}
                    animate={{
                      x: deltaX + targetOffsetX,
                      y: deltaY + targetOffsetY,
                      rotate: clusterOffset.rotate + (deltaX >= 0 ? 28 : -28),
                      scale: 0.82,
                      opacity: [1, 1, 0],
                    }}
                    transition={{
                      duration: 1.05,
                      delay: i * 0.035,
                      ease: [0.22, 1, 0.36, 1],
                      opacity: { times: [0, 0.78, 1] },
                    }}
                  >
                    <div className="card-back" />
                  </motion.div>
                );
              })}
            </div>
          );
        })}
      </AnimatePresence>
      <AnimatePresence>
        {seatCardSplats.map((splat) => (
          <div key={splat.id} className="card-toss-seatSplatLayer" aria-hidden="true">
            {splat.placements.map((placement, i) => (
              <motion.div
                key={`${splat.id}-${i}`}
                className="card-toss-seatSplatCard"
                style={{
                  left: splat.point.x - 32,
                  top: splat.point.y - 45,
                }}
                initial={{
                  x: placement.x * 0.2,
                  y: placement.y * 0.2,
                  rotate: placement.rotate,
                  scale: 0.2,
                  opacity: 0,
                }}
                animate={{
                  x: placement.x,
                  y: [placement.y, placement.y, placement.y + 10],
                  rotate: placement.rotate,
                  scale: [0.2, 1.15, 1.08],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 1.15,
                  delay: i * 0.016,
                  times: [0, 0.24, 0.99, 1],
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="card-back" />
              </motion.div>
            ))}
          </div>
        ))}
      </AnimatePresence>
      <AnimatePresence>
        {cardSplats.map((splat) => (
          <div key={splat.id} className="card-toss-centerSplatLayer" aria-hidden="true">
            {splat.placements.map((placement, i) => (
              <motion.div
                key={`${splat.id}-${i}`}
                className="card-toss-centerSplatCard"
                initial={{
                  x: placement.x * 0.2,
                  y: placement.y * 0.2,
                  rotate: placement.rotate,
                  scale: 0.08,
                  opacity: 0,
                }}
                animate={{
                  x: placement.x,
                  y: [placement.y, placement.y, placement.y + 34],
                  rotate: placement.rotate,
                  scale: [0.08, 3.25, 3.08],
                  opacity: [0, 1, 1, 1, 0],
                }}
                transition={{
                  duration: 1.75,
                  delay: i * 0.018,
                  times: [0, 0.22, 0.58, 0.99, 1],
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="card-back" />
              </motion.div>
            ))}
          </div>
        ))}
      </AnimatePresence>
    </>
  );
}
