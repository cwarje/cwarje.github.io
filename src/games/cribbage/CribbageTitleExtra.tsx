import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { GameHudProps } from '../registry';
import { getPlayerHudTextColor } from '../../networking/playerColors';
import type { CribbageState } from './types';
import { cribbageCribOwnerLabel, getShelvedShowHands } from './logic';
import { scoreCribShow, scoreShowHand } from './rules';
import { CRIB_HUD_FLIP_DURATION_MS, CribHudFlipCard } from '../shared/CribHudFlipCard';

export default function CribbageTitleExtra({ state }: GameHudProps) {
  const s = state as CribbageState;

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
  const shelvedHands = getShelvedShowHands(s);
  const [cribShowScoreVisible, setCribShowScoreVisible] = useState(false);

  useEffect(() => {
    if (!faceUpCrib) {
      setCribShowScoreVisible(false);
      return;
    }
    setCribShowScoreVisible(false);
    const t = window.setTimeout(() => setCribShowScoreVisible(true), CRIB_HUD_FLIP_DURATION_MS);
    return () => clearTimeout(t);
  }, [faceUpCrib]);

  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-xs sm:text-sm text-white/70">{cribLabel}</p>

      {showCribStrip && (
        <div className="flex items-center gap-2">
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
                return (
                  <div
                    key={`crib-hud-${card.suit}-${card.rank}-${i}`}
                    className="crosscrib-cribHudSlot"
                    style={{ zIndex: i + 1 }}
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
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
          {faceUpCrib && s.starterCard && cribShowScoreVisible ? (
            <span className="text-sm font-semibold text-white shrink-0">
              +{scoreCribShow(s.cribCards, s.starterCard)}
            </span>
          ) : null}
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

      {shelvedHands.length > 0 ? (
        <div className="space-y-1.5">
          {shelvedHands.map(({ seat, cards, player }) => (
            <motion.div
              key={`shelved-${seat}`}
              className="flex flex-col items-start gap-0.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <span
                className="text-xs sm:text-sm font-medium truncate max-w-[12rem]"
                style={{ color: getPlayerHudTextColor(player.color) }}
              >
                {player.name}
              </span>
              <div className="flex items-center gap-2">
                <div className="crosscrib-cribHudSpread pointer-events-none" aria-hidden>
                  {cards.map((card, i) => (
                    <div
                      key={`shelved-${seat}-${card.suit}-${card.rank}-${i}`}
                      className="crosscrib-cribHudSlot"
                      style={{ zIndex: i + 1 }}
                    >
                      <CribHudFlipCard card={card} faceUp />
                    </div>
                  ))}
                </div>
                {s.starterCard ? (
                  <span className="text-sm font-semibold text-white shrink-0">
                    +{scoreShowHand(cards, s.starterCard)}
                  </span>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
