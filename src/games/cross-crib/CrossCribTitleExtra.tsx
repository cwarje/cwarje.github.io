import { useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { CrossCribState } from './types';
import type { GameHudProps } from '../registry';
import { cribOwnerLabel } from './logic';
import type { Card } from './types';
import { CribHudFlipCard } from '../shared/CribHudFlipCard';

function isNewlyFilledCribSlot(
  i: number,
  card: Card | null,
  prevCrib: (Card | null)[] | undefined
): boolean {
  if (!card) return false;
  if (!prevCrib || prevCrib.length <= i) return true;
  return prevCrib[i] == null;
}

export default function CrossCribTitleExtra({ state }: GameHudProps) {
  const s = state as CrossCribState;
  const prevCribCardsRef = useRef<(Card | null)[] | undefined>(undefined);
  const prevCribCards = prevCribCardsRef.current;

  useLayoutEffect(() => {
    prevCribCardsRef.current = s.cribCards;
  });

  const owner = cribOwnerLabel(s);
  const cribLabel =
    s.players.length === 2 ? `${owner}'s crib` : `${owner}'s crib`;

  const cribLenOk = s.cribCards.length === 4;
  const discardHasCommitted =
    s.phase === 'crib-discard' && s.cribCards.some(c => c !== null);

  const showCribStrip =
    cribLenOk &&
    (s.phase === 'playing' ||
      s.phase === 'crib-reveal' ||
      s.phase === 'round-end' ||
      discardHasCommitted);

  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-xs sm:text-sm text-white/80">Round {s.roundNumber}/4</p>
      <p className="text-xs sm:text-sm text-white/70">{cribLabel}</p>
      {showCribStrip && (
        <div className="crosscrib-cribHudSpread pointer-events-none" aria-hidden>
          {s.phase === 'crib-discard'
            ? s.cribCards.map((card, i) =>
                card ? (
                  <div
                    key={`crib-discard-slot-${i}`}
                    className="crosscrib-cribHudSlot"
                    style={{ zIndex: i + 1 }}
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <div className="river-card river-card--compact crosscrib-cribHudCard crosscrib-cribHudCard--back" />
                    </motion.div>
                  </div>
                ) : null
              )
            : // prevCribCards is previous commit's crib (ref synced in useLayoutEffect); ref read is intentional here.
              // eslint-disable-next-line react-hooks/refs -- previous-render snapshot for entrance animation
              s.cribCards.map((card, i) => {
                const showFace =
                  s.phase === 'round-end' ||
                  (s.phase === 'crib-reveal' && i < s.cribRevealCount);

                const entrance = isNewlyFilledCribSlot(i, card, prevCribCards);

                return (
                  <div
                    key={`crib-hud-slot-${i}`}
                    className="crosscrib-cribHudSlot"
                    style={{ zIndex: i + 1 }}
                  >
                    {card ? (
                      <motion.div
                        initial={entrance ? { opacity: 0, y: 14 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        <CribHudFlipCard card={card} faceUp={showFace} />
                      </motion.div>
                    ) : (
                      <div className="river-card river-card--compact crosscrib-cribHudCard crosscrib-cribHudCard--back" />
                    )}
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}
