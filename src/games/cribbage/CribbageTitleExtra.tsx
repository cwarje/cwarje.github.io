import { useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { GameHudProps } from '../registry';
import type { CribbageState } from './types';
import { cribbageCribOwnerLabel } from './logic';
import { CribHudFlipCard } from '../shared/CribHudFlipCard';

export default function CribbageTitleExtra({ state }: GameHudProps) {
  const s = state as CribbageState;
  const prevCribLenRef = useRef(0);
  const prevLen = prevCribLenRef.current;

  useLayoutEffect(() => {
    prevCribLenRef.current = s.cribCards.length;
  });

  const owner = cribbageCribOwnerLabel(s);
  const cribLabel = `${owner}'s crib`;

  const n = s.players.length;
  const fullCrib = s.cribCards.length === 4;
  const show3pSeed = n === 3 && s.phase === 'crib-discard' && s.cribCards.length === 1;

  const showCribStrip =
    s.cribCards.length > 0 &&
    s.phase !== 'game-over' &&
    !s.gameOver &&
    (fullCrib || show3pSeed);

  const faceUpCrib = s.phase === 'show' && fullCrib && s.showAppliedSteps === n + 1;

  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-xs sm:text-sm text-white/70">{cribLabel}</p>

      {showCribStrip && (
        <div className="crosscrib-cribHudSpread pointer-events-none" aria-hidden>
          {show3pSeed && !fullCrib ? (
            <div className="crosscrib-cribHudSlot" style={{ zIndex: 1 }}>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <div className="river-card river-card--compact crosscrib-cribHudCard crosscrib-cribHudCard--back" />
              </motion.div>
            </div>
          ) : (
            s.cribCards.map((card, i) => {
              const entrance = i >= prevLen;
              return (
                <div
                  key={`crib-hud-${card.suit}-${card.rank}-${i}`}
                  className="crosscrib-cribHudSlot"
                  style={{ zIndex: i + 1 }}
                >
                  <motion.div
                    initial={entrance ? { opacity: 0, y: 14 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <CribHudFlipCard card={card} faceUp={faceUpCrib} />
                  </motion.div>
                </div>
              );
            })
          )}
        </div>
      )}

      {s.starterCard ? (
        <div className="flex flex-col items-start gap-0.5 text-white/90">
          <span className="text-xs uppercase tracking-wide text-white/50">Crib card</span>
          <div className="crosscrib-cribHudSlot" style={{ marginLeft: 0 }}>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <CribHudFlipCard card={s.starterCard} faceUp />
            </motion.div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
