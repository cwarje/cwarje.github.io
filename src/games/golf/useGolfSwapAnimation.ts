import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Card, GolfState } from './types';
import { cardEquals } from './rules';
import { FLIP_DURATION_MS, FLIP_TO_FLY_PAUSE_MS, FLY_DURATION_MS, getElementMetrics, type Point } from './golfAnimMetrics';

export type SwapPhase = 'flipSlot' | 'swapFly';

export interface GolfSwapAnimation {
  id: string;
  phase: SwapPhase;
  slotId: string;
  replacedCard: Card;
  drawnCard: Card;
  wasFaceDown: boolean;
  showDrawnFace: boolean;
  slotFrom: Point;
  slotWidth: number;
  slotHeight: number;
  discardTo: Point;
  drawnFrom: Point;
  drawnTo: Point;
  pileWidth: number;
  pileHeight: number;
}

function findSwapSlotIndex(
  prevTable: GolfState['players'][number]['table'],
  nextTable: GolfState['players'][number]['table'],
): number | null {
  for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
    const prevSlot = prevTable[slotIndex];
    const nextSlot = nextTable[slotIndex];
    if (!prevSlot || !nextSlot) continue;
    if (!cardEquals(prevSlot.card, nextSlot.card) || prevSlot.faceUp !== nextSlot.faceUp) {
      return slotIndex;
    }
  }
  return null;
}

export function useGolfSwapAnimation(options: {
  boardRef: RefObject<HTMLDivElement | null>;
  stockPileRef: RefObject<HTMLButtonElement | null>;
  discardPileRef: RefObject<HTMLButtonElement | null>;
  slotRefs: RefObject<Map<string, HTMLButtonElement>>;
  state: GolfState;
  myId: string;
  animationBusyRef: MutableRefObject<boolean>;
}) {
  const { boardRef, stockPileRef, discardPileRef, slotRefs, state, myId, animationBusyRef } = options;
  const reduceMotion = useReducedMotion();
  const prevStateRef = useRef(state);
  const animationRef = useRef<GolfSwapAnimation | null>(null);
  const [animation, setAnimation] = useState<GolfSwapAnimation | null>(null);

  animationRef.current = animation;

  const completeAnimation = useCallback(() => {
    setAnimation(null);
  }, []);

  const advancePhase = useCallback(() => {
    setAnimation(prev => (prev && prev.phase === 'flipSlot' ? { ...prev, phase: 'swapFly' } : prev));
  }, []);

  useLayoutEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (animationRef.current || animationBusyRef.current) return;

    const drawnCard = prev.pendingDraw;
    if (!drawnCard || state.pendingDraw) return;

    const actorIndex = prev.currentPlayerIndex;
    const actor = prev.players[actorIndex];
    const nextActor = state.players[actorIndex];
    if (!actor || !nextActor) return;

    const slotIndex = findSwapSlotIndex(actor.table, nextActor.table);
    if (slotIndex === null) return;

    const replacedSlot = actor.table[slotIndex];
    if (!replacedSlot) return;

    const newDiscardTop = state.discard[state.discard.length - 1];
    if (!newDiscardTop || !cardEquals(newDiscardTop, replacedSlot.card)) return;

    const nextSlot = nextActor.table[slotIndex];
    if (!nextSlot || !cardEquals(nextSlot.card, drawnCard) || !nextSlot.faceUp) return;

    if (reduceMotion) return;

    const slotId = `${actor.id}-slot-${slotIndex}`;
    const slotEl = slotRefs.current?.get(slotId);
    const slotMetrics = getElementMetrics(boardRef, slotEl);
    const discardMetrics = getElementMetrics(boardRef, discardPileRef);
    const drawSource = prev.pendingDrawSource;
    const sourceRef = drawSource === 'discard' ? discardPileRef : stockPileRef;
    const sourceMetrics = getElementMetrics(boardRef, sourceRef);
    if (!slotMetrics || !discardMetrics || !sourceMetrics) return;

    const wasFaceDown = !replacedSlot.faceUp;
    const isActor = actor.id === myId;
    const showDrawnFace = drawSource === 'discard' || isActor;

    animationBusyRef.current = true;
    setAnimation({
      id: `${slotId}-${Date.now()}`,
      phase: wasFaceDown ? 'flipSlot' : 'swapFly',
      slotId,
      replacedCard: replacedSlot.card,
      drawnCard,
      wasFaceDown,
      showDrawnFace,
      slotFrom: slotMetrics.center,
      slotWidth: slotMetrics.width,
      slotHeight: slotMetrics.height,
      discardTo: discardMetrics.center,
      drawnFrom: sourceMetrics.center,
      drawnTo: slotMetrics.center,
      pileWidth: sourceMetrics.width,
      pileHeight: sourceMetrics.height,
    });
  }, [state, myId, boardRef, stockPileRef, discardPileRef, slotRefs, reduceMotion, animationBusyRef]);

  useEffect(() => {
    if (!animation) return;

    const duration =
      animation.phase === 'flipSlot'
        ? FLIP_DURATION_MS + FLIP_TO_FLY_PAUSE_MS
        : FLY_DURATION_MS;

    const timer = setTimeout(() => {
      if (animation.phase === 'swapFly') {
        completeAnimation();
      } else {
        advancePhase();
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [animation, advancePhase, completeAnimation]);

  const hideDiscardTop =
    animation !== null &&
    state.discard.length > 0 &&
    cardEquals(state.discard[state.discard.length - 1]!, animation.replacedCard);

  const animatingSlotId = animation?.slotId ?? null;

  return { animation, animatingSlotId, hideDiscardTop };
}
