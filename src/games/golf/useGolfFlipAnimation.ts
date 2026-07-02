import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Card, GolfState } from './types';
import { cardEquals } from './rules';
import { FLIP_DURATION_MS, getElementMetrics, type Point } from './golfAnimMetrics';

export interface GolfFlipAnimation {
  id: string;
  slotId: string;
  card: Card;
  slotFrom: Point;
  slotWidth: number;
  slotHeight: number;
}

function findOptionalFlipSlotIndex(
  prevTable: GolfState['players'][number]['table'],
  nextTable: GolfState['players'][number]['table'],
): number | null {
  for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
    const prevSlot = prevTable[slotIndex];
    const nextSlot = nextTable[slotIndex];
    if (!prevSlot || !nextSlot) continue;
    if (
      cardEquals(prevSlot.card, nextSlot.card) &&
      !prevSlot.faceUp &&
      nextSlot.faceUp
    ) {
      return slotIndex;
    }
  }
  return null;
}

function findFlipTransition(
  prev: GolfState,
  state: GolfState,
): { actorIndex: number; slotIndex: number } | null {
  const actorIndex = prev.currentPlayerIndex;
  const actor = prev.players[actorIndex];
  const nextActor = state.players[actorIndex];
  if (
    actor &&
    nextActor &&
    actor.setupFlipsRemaining > nextActor.setupFlipsRemaining
  ) {
    const slotIndex = findOptionalFlipSlotIndex(actor.table, nextActor.table);
    return slotIndex === null ? null : { actorIndex, slotIndex };
  }

  if (prev.pendingOptionalFlip && !state.pendingOptionalFlip) {
    const actorIndex = prev.currentPlayerIndex;
    const actor = prev.players[actorIndex];
    const nextActor = state.players[actorIndex];
    if (!actor || !nextActor) return null;
    const slotIndex = findOptionalFlipSlotIndex(actor.table, nextActor.table);
    return slotIndex === null ? null : { actorIndex, slotIndex };
  }

  if (
    prev.pendingDraw &&
    prev.pendingDrawSource === 'stock' &&
    !state.pendingDraw &&
    !state.pendingOptionalFlip
  ) {
    const actorIndex = prev.currentPlayerIndex;
    const actor = prev.players[actorIndex];
    const nextActor = state.players[actorIndex];
    if (!actor || !nextActor) return null;
    const slotIndex = findOptionalFlipSlotIndex(actor.table, nextActor.table);
    if (slotIndex === null) return null;
    const nextSlot = nextActor.table[slotIndex]!;
    if (prev.pendingDraw && cardEquals(nextSlot.card, prev.pendingDraw)) return null;
    return { actorIndex, slotIndex };
  }

  return null;
}

export function useGolfFlipAnimation(options: {
  boardRef: RefObject<HTMLDivElement | null>;
  slotRefs: RefObject<Map<string, HTMLButtonElement>>;
  state: GolfState;
  animationBusyRef: MutableRefObject<boolean>;
}) {
  const { boardRef, slotRefs, state, animationBusyRef } = options;
  const reduceMotion = useReducedMotion();
  const prevStateRef = useRef(state);
  const animationRef = useRef<GolfFlipAnimation | null>(null);
  const [animation, setAnimation] = useState<GolfFlipAnimation | null>(null);

  useLayoutEffect(() => {
    animationRef.current = animation;
  }, [animation]);

  const completeAnimation = useCallback(() => {
    setAnimation(null);
  }, []);

  useLayoutEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (animationRef.current || animationBusyRef.current) return;

    const transition = findFlipTransition(prev, state);
    if (!transition) return;

    const { actorIndex, slotIndex } = transition;
    const actor = prev.players[actorIndex];
    const flippedSlot = actor?.table[slotIndex];
    if (!flippedSlot) return;

    if (reduceMotion) return;

    const slotId = `${actor.id}-slot-${slotIndex}`;
    const slotEl = slotRefs.current?.get(slotId);
    const slotMetrics = getElementMetrics(boardRef, slotEl);
    if (!slotMetrics) return;

    animationBusyRef.current = true;
    setAnimation({
      id: `${slotId}-${Date.now()}`,
      slotId,
      card: flippedSlot.card,
      slotFrom: slotMetrics.center,
      slotWidth: slotMetrics.width,
      slotHeight: slotMetrics.height,
    });
  }, [state, boardRef, slotRefs, reduceMotion, animationBusyRef]);

  useEffect(() => {
    if (!animation) return;

    const timer = setTimeout(completeAnimation, FLIP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [animation, completeAnimation]);

  const animatingSlotId = animation?.slotId ?? null;

  return { animation, animatingSlotId };
}
