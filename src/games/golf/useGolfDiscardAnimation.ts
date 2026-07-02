import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Card, GolfState } from './types';
import { cardEquals } from './rules';
import { FLIP_DURATION_MS, FLIP_TO_FLY_PAUSE_MS, FLY_DURATION_MS, getElementMetrics, type Point } from './golfAnimMetrics';

export type { Point };

export interface GolfDiscardAnimation {
  id: string;
  card: Card;
  from: Point;
  to: Point;
  phase: 'flip' | 'fly';
  skipFlip: boolean;
  width: number;
  height: number;
}

export function useGolfDiscardAnimation(options: {
  boardRef: RefObject<HTMLDivElement | null>;
  stockPileRef: RefObject<HTMLButtonElement | null>;
  discardPileRef: RefObject<HTMLButtonElement | null>;
  state: GolfState;
  myId: string;
  animationBusyRef: MutableRefObject<boolean>;
}) {
  const { boardRef, stockPileRef, discardPileRef, state, myId, animationBusyRef } = options;
  const reduceMotion = useReducedMotion();
  const prevStateRef = useRef(state);
  const animationRef = useRef<GolfDiscardAnimation | null>(null);
  const [animation, setAnimation] = useState<GolfDiscardAnimation | null>(null);

  useEffect(() => {
    animationRef.current = animation;
  }, [animation]);

  const completeAnimation = useCallback(() => {
    setAnimation(null);
  }, []);

  const advanceToFly = useCallback(() => {
    setAnimation(prev => (prev && prev.phase === 'flip' ? { ...prev, phase: 'fly' } : prev));
  }, []);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (animationRef.current || animationBusyRef.current) return;

    const hadStockDraw = prev.pendingDraw && prev.pendingDrawSource === 'stock';
    const clearedDraw = !state.pendingDraw;
    if (!hadStockDraw || !clearedDraw) return;

    const discarded = prev.pendingDraw!;
    const newTop = state.discard[state.discard.length - 1];
    if (!newTop || !cardEquals(newTop, discarded)) return;

    if (reduceMotion) return;

    const stockMetrics = getElementMetrics(boardRef, stockPileRef);
    const discardMetrics = getElementMetrics(boardRef, discardPileRef);
    if (!stockMetrics || !discardMetrics) return;

    const prevCurrentPlayerId = prev.players[prev.currentPlayerIndex]?.id;
    const skipFlip = prevCurrentPlayerId === myId;

    animationBusyRef.current = true;
    setAnimation({
      id: `${discarded.rank}-${discarded.suit}-${Date.now()}`,
      card: discarded,
      from: stockMetrics.center,
      to: discardMetrics.center,
      phase: skipFlip ? 'fly' : 'flip',
      skipFlip,
      width: stockMetrics.width,
      height: stockMetrics.height,
    });
  }, [state, myId, boardRef, stockPileRef, discardPileRef, reduceMotion, animationBusyRef]);

  useEffect(() => {
    if (!animation || animation.phase !== 'flip') return;
    const timer = setTimeout(advanceToFly, FLIP_DURATION_MS + FLIP_TO_FLY_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [animation, advanceToFly]);

  useEffect(() => {
    if (!animation || animation.phase !== 'fly') return;
    const timer = setTimeout(completeAnimation, FLY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [animation, completeAnimation]);

  const hideDiscardTop =
    animation !== null &&
    state.discard.length > 0 &&
    cardEquals(state.discard[state.discard.length - 1]!, animation.card);

  return { animation, hideDiscardTop };
}

export { FLIP_DURATION_MS, FLY_DURATION_MS };
