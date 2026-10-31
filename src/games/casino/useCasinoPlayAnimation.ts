import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useReducedMotion } from 'framer-motion';
import { DEAL_ANIMATION_TAIL_MS, extendDealHoldUntil } from '../shared/dealTiming';
import {
  CAPTURE_STAGGER_MS,
  FLY_DURATION_MS,
  TABLE_GROUP_STAGGER_MS,
  getElementMetrics,
  resolveTableCardSize,
  type Point,
} from './casinoAnimMetrics';
import {
  detectCasinoPlayAnimIntent,
  type CasinoPlayAnimIntent,
} from './casinoPlayAnimDetect';
import type { Card, CasinoState } from './types';
import { cardEquals } from './types';

export interface CasinoPlayFlight {
  id: string;
  card: Card;
  from: Point;
  to: Point;
  width: number;
  height: number;
  delayMs: number;
  durationMs: number;
}

export interface CasinoPlayAnimation {
  id: string;
  kind: CasinoPlayAnimIntent['kind'];
  flights: CasinoPlayFlight[];
  /** Slot indices whose static table UI should stay hidden. */
  hiddenSlotIndices: number[];
  /** Played card hidden from hand while flying to table. */
  hiddenHandCard: Card | null;
  hiddenHandPlayerId: string | null;
  /** Suppress capture preview overlay until play-to-table lands. */
  suppressCapturePreview: boolean;
}

export interface CasinoHandLayoutMetrics {
  cardWidth: number;
  cardHeight: number;
  step: number;
  spreadWidth: number;
  /** Matches `.casino-handCardWrap { top: … }` */
  cardWrapTop: number;
}

const CASINO_HAND_CARD_WRAP_TOP_PX = 14;
/** Show static table card under the flying card before removing the overlay. */
const LANDING_REVEAL_MS = 48;

function playAnimationHoldUntilMs(flights: CasinoPlayFlight[]): number {
  if (flights.length === 0) return Date.now();
  const maxEnd = flights.reduce(
    (max, f) => Math.max(max, f.delayMs + f.durationMs),
    0,
  );
  return Date.now() + maxEnd + LANDING_REVEAL_MS + 50 + DEAL_ANIMATION_TAIL_MS;
}

export function computeCasinoHandLayout(handWidth: number, cardCount: number): CasinoHandLayoutMetrics {
  const available = Math.max(handWidth - 8, 220);
  const maxCardWidth = 84;
  const cardWidth = Math.max(58, Math.min(available * 0.2, maxCardWidth));
  const cardHeight = Math.round(cardWidth * 1.45);
  const defaultStep = Math.round(cardWidth * 0.58);
  const fitStep = cardCount > 1 ? (available - cardWidth) / (cardCount - 1) : defaultStep;
  const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
  const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
  return {
    cardWidth,
    cardHeight,
    step,
    spreadWidth,
    cardWrapTop: CASINO_HAND_CARD_WRAP_TOP_PX,
  };
}

function defaultCardSize(): { width: number; height: number } {
  return { width: 56, height: 82 };
}

function intentId(intent: CasinoPlayAnimIntent): string {
  switch (intent.kind) {
    case 'capture-preview-play':
      return `preview-${intent.playerId}-${intent.playedCard.rank}${intent.playedCard.suit}`;
    case 'announcement-hand-to-table':
      return `ann-${intent.announcementKind}-${intent.playerId}-${intent.targetSlotIndex}`;
    case 'capture-to-seat':
      return `capture-seat-${intent.playerId}-${intent.capturedCards.length}`;
    case 'table-only-group':
      return `group-${intent.playerId}-${intent.targetSlotIndex}`;
  }
}

function centroidOfSlots(
  boardRef: RefObject<HTMLDivElement | null>,
  tableSlotRefs: RefObject<Map<number, HTMLElement>>,
  indices: number[],
  fallback: Point,
): Point {
  const points: Point[] = [];
  for (const idx of indices) {
    const el = tableSlotRefs.current?.get(idx);
    const m = getElementMetrics(boardRef, el ?? null);
    if (m) points.push(m.center);
  }
  if (points.length === 0) return fallback;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

export function useCasinoPlayAnimation(options: {
  boardRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLDivElement | null>;
  handContainerRef: RefObject<HTMLDivElement | null>;
  tableSlotRefs: RefObject<Map<number, HTMLElement>>;
  seatRefs: RefObject<Map<string, HTMLButtonElement>>;
  handWidth: number;
  myId: string;
  state: CasinoState;
  dealIsDealing: boolean;
}) {
  const {
    boardRef,
    tableRef,
    handContainerRef,
    tableSlotRefs,
    seatRefs,
    handWidth,
    myId,
    state,
    dealIsDealing,
  } = options;

  const reduceMotion = useReducedMotion();
  const prevStateRef = useRef(state);
  const animationRef = useRef<CasinoPlayAnimation | null>(null);
  const [animation, setAnimation] = useState<CasinoPlayAnimation | null>(null);
  const lastStartedIdRef = useRef<string | null>(null);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingInProgressRef = useRef(false);

  useEffect(() => {
    animationRef.current = animation;
  }, [animation]);

  const clearAnimation = useCallback(() => {
    landingInProgressRef.current = false;
    lastStartedIdRef.current = null;
    setAnimation(null);
  }, []);

  const finishLanding = useCallback(() => {
    if (landingInProgressRef.current) return;
    const anim = animationRef.current;
    if (!anim) return;

    if (anim.hiddenSlotIndices.length === 0) {
      clearAnimation();
      return;
    }

    landingInProgressRef.current = true;
    setAnimation({
      ...anim,
      hiddenSlotIndices: [],
      hiddenHandCard: null,
      hiddenHandPlayerId: null,
      suppressCapturePreview: false,
    });

    if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
    landingTimerRef.current = setTimeout(() => {
      landingTimerRef.current = null;
      clearAnimation();
    }, LANDING_REVEAL_MS);
  }, [clearAnimation]);

  useEffect(
    () => () => {
      if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
    },
    [],
  );

  const resolveHandSource = useCallback(
    (playerId: string, card: Card, prevState: CasinoState): ReturnType<typeof getElementMetrics> => {
      const prevPlayer = prevState.players.find(p => p.id === playerId);
      if (!prevPlayer) return null;

      const handIndex = prevPlayer.hand.findIndex(c => cardEquals(c, card));
      const cardSize = defaultCardSize();

      if (playerId === myId) {
        const container = handContainerRef.current;
        const boardRect = boardRef.current?.getBoundingClientRect();
        if (!container || !boardRect) return null;
        const containerRect = container.getBoundingClientRect();
        const { cardWidth, cardHeight, step, spreadWidth, cardWrapTop } = computeCasinoHandLayout(
          handWidth,
          prevPlayer.hand.length,
        );
        const spreadLeft = containerRect.left + (containerRect.width - spreadWidth) / 2;
        const cardCenterX =
          handIndex >= 0
            ? spreadLeft + handIndex * step + cardWidth / 2
            : spreadLeft + spreadWidth / 2;
        const cardCenterY =
          containerRect.top + cardWrapTop + cardHeight / 2;
        return {
          center: {
            x: cardCenterX - boardRect.left,
            y: cardCenterY - boardRect.top,
          },
          width: cardWidth,
          height: cardHeight,
        };
      }

      const seatEl = seatRefs.current?.get(playerId);
      const seatMetrics = getElementMetrics(boardRef, seatEl ?? null);
      if (!seatMetrics) return null;
      return {
        center: { x: seatMetrics.center.x, y: seatMetrics.center.y - 36 },
        width: cardSize.width,
        height: cardSize.height,
      };
    },
    [boardRef, handContainerRef, handWidth, myId, seatRefs],
  );

  const resolveSlotTarget = useCallback(
    (slotIndex: number, fallback: Point) => {
      const el = tableSlotRefs.current?.get(slotIndex);
      const m = getElementMetrics(boardRef, el ?? null);
      const tableSize = resolveTableCardSize(boardRef, tableSlotRefs);
      return (
        m ?? {
          center: fallback,
          width: tableSize.width,
          height: tableSize.height,
        }
      );
    },
    [boardRef, tableSlotRefs],
  );

  const buildAnimationFromIntent = useCallback(
    (intent: CasinoPlayAnimIntent, prevState: CasinoState): CasinoPlayAnimation | null => {
      const tableCenter = getElementMetrics(boardRef, tableRef.current);
      const fallbackCenter: Point = tableCenter?.center ?? { x: 200, y: 200 };
      const cardSize = defaultCardSize();
      const tableCardSize = resolveTableCardSize(boardRef, tableSlotRefs);

      const flights: CasinoPlayFlight[] = [];
      let hiddenSlotIndices: number[] = [];
      let hiddenHandCard: Card | null = null;
      let hiddenHandPlayerId: string | null = null;
      let suppressCapturePreview = false;

      if (intent.kind === 'capture-preview-play') {
        const source =
          resolveHandSource(intent.playerId, intent.playedCard, prevState) ??
          ({ center: fallbackCenter, width: cardSize.width, height: cardSize.height } as const);
        const destCenter = centroidOfSlots(
          boardRef,
          tableSlotRefs,
          intent.capturedSlotIndices,
          fallbackCenter,
        );
        const destSlot = intent.capturedSlotIndices[0];
        const destMetrics =
          destSlot != null
            ? resolveSlotTarget(destSlot, destCenter)
            : { center: destCenter, width: source.width, height: source.height };

        flights.push({
          id: 'preview-play',
          card: intent.playedCard,
          from: source.center,
          to: destMetrics.center,
          width: tableCardSize.width,
          height: tableCardSize.height,
          delayMs: 0,
          durationMs: FLY_DURATION_MS,
        });
        hiddenHandCard = intent.playedCard;
        hiddenHandPlayerId = intent.playerId;
        suppressCapturePreview = true;
      }

      if (intent.kind === 'announcement-hand-to-table') {
        const source =
          resolveHandSource(intent.playerId, intent.playedCard, prevState) ??
          ({ center: fallbackCenter, width: cardSize.width, height: cardSize.height } as const);
        const dest = resolveSlotTarget(intent.targetSlotIndex, fallbackCenter);
        flights.push({
          id: 'hand-to-table',
          card: intent.playedCard,
          from: source.center,
          to: dest.center,
          width: tableCardSize.width,
          height: tableCardSize.height,
          delayMs: 0,
          durationMs: FLY_DURATION_MS,
        });
        hiddenSlotIndices = [intent.targetSlotIndex];
        hiddenHandCard = intent.playedCard;
        hiddenHandPlayerId = intent.playerId;
      }

      if (intent.kind === 'capture-to-seat') {
        const seatEl = seatRefs.current?.get(intent.playerId);
        const seatMetrics = getElementMetrics(boardRef, seatEl ?? null);
        const dest = seatMetrics?.center ?? fallbackCenter;
        const destW = seatMetrics?.width || cardSize.width;
        const destH = seatMetrics?.height || cardSize.height;

        let delay = 0;
        if (intent.playedFromPreview) {
          const { card, slotIndices } = intent.playedFromPreview;
          const previewCenter = centroidOfSlots(
            boardRef,
            tableSlotRefs,
            slotIndices,
            fallbackCenter,
          );
          const anchorSlot = slotIndices[0];
          const fromMetrics =
            anchorSlot != null
              ? resolveSlotTarget(anchorSlot, previewCenter)
              : {
                  center: previewCenter,
                  width: cardSize.width,
                  height: cardSize.height,
                };
          flights.push({
            id: 'capture-preview-card',
            card,
            from: fromMetrics.center,
            to: dest,
            width: tableCardSize.width,
            height: tableCardSize.height,
            delayMs: delay,
            durationMs: FLY_DURATION_MS,
          });
          delay += CAPTURE_STAGGER_MS;
        } else if (intent.playedFromHand) {
          const source =
            resolveHandSource(intent.playerId, intent.playedFromHand, prevState) ??
            ({ center: fallbackCenter, width: cardSize.width, height: cardSize.height } as const);
          flights.push({
            id: 'capture-hand',
            card: intent.playedFromHand,
            from: source.center,
            to: dest,
            width: source.width,
            height: source.height,
            delayMs: delay,
            durationMs: FLY_DURATION_MS,
          });
          delay += CAPTURE_STAGGER_MS;
        }

        for (const { slotIndex, cards } of intent.slotFlights) {
          const slotMetrics = resolveSlotTarget(slotIndex, fallbackCenter);
          for (let i = 0; i < cards.length; i++) {
            const card = cards[i]!;
            flights.push({
              id: `capture-slot-${slotIndex}-${i}-${card.rank}${card.suit}`,
              card,
              from: slotMetrics.center,
              to: dest,
              width: tableCardSize.width,
              height: tableCardSize.height,
              delayMs: delay,
              durationMs: FLY_DURATION_MS,
            });
            delay += CAPTURE_STAGGER_MS;
          }
          hiddenSlotIndices.push(slotIndex);
        }
      }

      if (intent.kind === 'table-only-group') {
        const dest = resolveSlotTarget(intent.targetSlotIndex, fallbackCenter);
        hiddenSlotIndices = [intent.targetSlotIndex, ...intent.sourceFlights.map(s => s.slotIndex)];
        intent.sourceFlights.forEach((src, i) => {
          const slotMetrics = resolveSlotTarget(src.slotIndex, fallbackCenter);
          flights.push({
            id: `group-${src.slotIndex}-${src.card.rank}${src.card.suit}`,
            card: src.card,
            from: slotMetrics.center,
            to: dest.center,
            width: tableCardSize.width,
            height: tableCardSize.height,
            delayMs: i * TABLE_GROUP_STAGGER_MS,
            durationMs: FLY_DURATION_MS,
          });
        });
      }

      if (flights.length === 0) return null;

      return {
        id: intentId(intent),
        kind: intent.kind,
        flights,
        hiddenSlotIndices,
        hiddenHandCard,
        hiddenHandPlayerId,
        suppressCapturePreview,
      };
    },
    [boardRef, tableRef, tableSlotRefs, seatRefs, resolveHandSource, resolveSlotTarget],
  );

  useLayoutEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (dealIsDealing || reduceMotion) return;
    if (animationRef.current) return;

    const intent = detectCasinoPlayAnimIntent(prev, state);
    if (!intent) return;

    const animId = intentId(intent);
    if (lastStartedIdRef.current === animId) return;

    const built = buildAnimationFromIntent(intent, prev);
    if (!built) return;

    lastStartedIdRef.current = animId;
    landingInProgressRef.current = false;
    extendDealHoldUntil(playAnimationHoldUntilMs(built.flights));
    setAnimation(built);
  }, [state, dealIsDealing, reduceMotion, buildAnimationFromIntent]);

  useEffect(() => {
    if (!animation) return;
    const maxEnd = animation.flights.reduce(
      (max, f) => Math.max(max, f.delayMs + f.durationMs),
      0,
    );
    const timer = setTimeout(finishLanding, maxEnd + 50);
    return () => clearTimeout(timer);
  }, [animation, finishLanding]);

  const hideTableSlot = useCallback(
    (slotIndex: number) => {
      if (!animation) return false;
      return animation.hiddenSlotIndices.includes(slotIndex);
    },
    [animation],
  );

  const hideHandCard = useCallback(
    (playerId: string, card: Card) => {
      if (!animation?.hiddenHandCard || !animation.hiddenHandPlayerId) return false;
      return (
        animation.hiddenHandPlayerId === playerId && cardEquals(animation.hiddenHandCard, card)
      );
    },
    [animation],
  );

  const displayMyHand = useCallback(
    (hand: Card[]) => {
      if (!animation?.hiddenHandCard || animation.hiddenHandPlayerId !== myId) return hand;
      if (hand.some(c => cardEquals(c, animation.hiddenHandCard!))) return hand;
      return [...hand, animation.hiddenHandCard];
    },
    [animation, myId],
  );

  const suppressCapturePreview =
    animation?.suppressCapturePreview === true && animation.kind === 'capture-preview-play';

  return {
    animation,
    hideTableSlot,
    hideHandCard,
    displayMyHand,
    suppressCapturePreview,
    handleAnimationComplete: finishLanding,
  };
}
