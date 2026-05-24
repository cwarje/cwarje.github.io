import { useEffect, useRef, useState } from 'react';
import type { CasinoState } from './types';

const LAST_DEAL_FLASH_MS = 5000;

export function useLastDealFlash(s: CasinoState): boolean {
  const [isFlashing, setIsFlashing] = useState(false);
  const prevDeckLengthRef = useRef(s.deck.length);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsFlashing(false);
    prevDeckLengthRef.current = s.deck.length;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [s.roundNumber]);

  useEffect(() => {
    const prevDeckLength = prevDeckLengthRef.current;
    prevDeckLengthRef.current = s.deck.length;

    const transitioned =
      prevDeckLength > 0 &&
      s.deck.length === 0 &&
      s.phase === 'playing' &&
      !s.gameOver;

    if (!transitioned) return;

    setIsFlashing(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsFlashing(false);
      timeoutRef.current = null;
    }, LAST_DEAL_FLASH_MS);
    // Intentionally no cleanup here — phase/announcement updates must not cancel the timer.
  }, [s.deck.length, s.gameOver, s.roundNumber]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  return isFlashing;
}
