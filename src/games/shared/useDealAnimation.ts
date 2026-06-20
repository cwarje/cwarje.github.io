import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  DEAL_ANIMATION_TAIL_MS,
  DEAL_FLIGHT_DURATION_MS,
  DEAL_MAX_STEP_MS,
  DEAL_MIN_STEP_MS,
  DEAL_TOTAL_DEAL_MS,
  notifyDealAnimationStarted,
} from './dealTiming';

export interface DealPoint {
  x: number;
  y: number;
}

export interface DealSeat {
  playerId: string;
  isSelf: boolean;
  /** Seat position as a percentage of the table element (0-100). */
  seatLeft: number;
  seatTop: number;
  /** Number of cards dealt to this seat's hand. */
  count: number;
}

export interface DealExtraTarget {
  id: string;
  /** Landing position as a percentage of the table element (0-100). */
  seatLeft: number;
  seatTop: number;
  /** When true the flying card flips face-up as it lands (table/starter cards). */
  faceUp?: boolean;
}

export interface DealFlight {
  id: string;
  start: DealPoint;
  end: DealPoint;
  /** Delay before the flight begins, in seconds. */
  delay: number;
  /** Flight duration, in seconds. */
  duration: number;
  faceUp: boolean;
}

interface DealRuntime {
  key: string;
  active: boolean;
  flights: DealFlight[];
  dealCenter: DealPoint | null;
  revealCounts: Record<string, number>;
  revealedExtras: Record<string, true>;
}

interface UseDealAnimationOptions {
  boardRef: RefObject<HTMLElement | null>;
  tableRef: RefObject<HTMLElement | null>;
  /** Changes whenever a fresh deal occurs (e.g. round number). */
  dealKey: string;
  seats: DealSeat[];
  extraTargets?: DealExtraTarget[];
  flightDurationMs?: number;
  totalDealMs?: number;
  minStepMs?: number;
  maxStepMs?: number;
}

export interface DealAnimationResult {
  isDealing: boolean;
  flights: DealFlight[];
  dealCenter: DealPoint | null;
  revealCounts: Record<string, number>;
  /** Cards revealed so far for a seat; returns `fallback` when not dealing. */
  revealedFor: (playerId: string, fallback: number) => number;
  /** Whether a table/extra card has landed yet; always true when not dealing. */
  isExtraRevealed: (id: string) => boolean;
}

function boardPointFromClient(boardRect: DOMRect, clientX: number, clientY: number): DealPoint {
  return { x: clientX - boardRect.left, y: clientY - boardRect.top };
}

export function useDealAnimation(options: UseDealAnimationOptions): DealAnimationResult {
  const {
    boardRef,
    tableRef,
    dealKey,
    seats,
    extraTargets,
    flightDurationMs = DEAL_FLIGHT_DURATION_MS,
    totalDealMs = DEAL_TOTAL_DEAL_MS,
    minStepMs = DEAL_MIN_STEP_MS,
    maxStepMs = DEAL_MAX_STEP_MS,
  } = options;

  const reduceMotion = useReducedMotion();

  const seatsRef = useRef<DealSeat[]>(seats);
  const extraTargetsRef = useRef<DealExtraTarget[] | undefined>(extraTargets);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [layoutRetry, setLayoutRetry] = useState(0);

  const hasCardsToDeal = seats.some(seat => seat.count > 0) || (extraTargets?.length ?? 0) > 0;
  const shouldAnimate = hasCardsToDeal && !reduceMotion;

  const [runtime, setRuntime] = useState<DealRuntime>({
    key: dealKey,
    active: shouldAnimate,
    flights: [],
    dealCenter: null,
    revealCounts: {},
    revealedExtras: {},
  });

  // Reset synchronously during render when a new deal arrives so the hand
  // never flashes its full contents before the animation gates it.
  if (runtime.key !== dealKey) {
    setRuntime({
      key: dealKey,
      active: shouldAnimate,
      flights: [],
      dealCenter: null,
      revealCounts: {},
      revealedExtras: {},
    });
  }

  // Keep the latest seat/target data available to the deal effect without
  // making the effect re-run on every render. Declared before the deal effect
  // so it commits first on the render where dealKey changes.
  useEffect(() => {
    seatsRef.current = seats;
    extraTargetsRef.current = extraTargets;
  });

  useEffect(() => {
    setLayoutRetry(0);
  }, [dealKey]);

  useEffect(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    const currentSeats = seatsRef.current;
    const currentExtras = extraTargetsRef.current ?? [];
    const hasCards = currentSeats.some(seat => seat.count > 0) || currentExtras.length > 0;

    if (!hasCards || reduceMotion) {
      setRuntime(prev => (prev.key === dealKey ? { ...prev, active: false } : prev));
      return;
    }

    const boardRect = boardRef.current?.getBoundingClientRect();
    const tableRect = tableRef.current?.getBoundingClientRect();
    if (!boardRect || !tableRect || tableRect.width === 0 || tableRect.height === 0) {
      if (layoutRetry < 60) {
        const retryTimeout = setTimeout(() => setLayoutRetry(retry => retry + 1), 32);
        timeoutsRef.current.push(retryTimeout);
        return;
      }
      setRuntime(prev => (prev.key === dealKey ? { ...prev, active: false } : prev));
      return;
    }

    const dealCenter = boardPointFromClient(
      boardRect,
      tableRect.left + tableRect.width / 2,
      tableRect.top + tableRect.height / 2,
    );

    const tablePointFromPct = (leftPct: number, topPct: number): DealPoint =>
      boardPointFromClient(
        boardRect,
        tableRect.left + (tableRect.width * leftPct) / 100,
        tableRect.top + (tableRect.height * topPct) / 100,
      );

    interface PlannedFlight {
      target: DealPoint;
      playerId: string | null;
      extraId: string | null;
      faceUp: boolean;
    }

    const planned: PlannedFlight[] = [];
    // Table/extra cards are dealt first, before any cards go to player hands.
    for (const extra of currentExtras) {
      planned.push({
        target: tablePointFromPct(extra.seatLeft, extra.seatTop),
        playerId: null,
        extraId: extra.id,
        faceUp: extra.faceUp ?? true,
      });
    }
    const maxCount = currentSeats.reduce((max, seat) => Math.max(max, seat.count), 0);
    for (let pass = 0; pass < maxCount; pass++) {
      for (const seat of currentSeats) {
        if (pass < seat.count) {
          planned.push({
            target: tablePointFromPct(seat.seatLeft, seat.seatTop),
            playerId: seat.playerId,
            extraId: null,
            faceUp: false,
          });
        }
      }
    }

    if (planned.length === 0) {
      setRuntime(prev => (prev.key === dealKey ? { ...prev, active: false } : prev));
      return;
    }

    const stepMs = Math.max(minStepMs, Math.min(maxStepMs, totalDealMs / planned.length));

    const flights: DealFlight[] = planned.map((plan, index) => ({
      id: `${dealKey}-${index}`,
      start: dealCenter,
      end: plan.target,
      delay: (index * stepMs) / 1000,
      duration: flightDurationMs / 1000,
      faceUp: plan.faceUp,
    }));

    setRuntime({ key: dealKey, active: true, flights, dealCenter, revealCounts: {}, revealedExtras: {} });
    notifyDealAnimationStarted(planned.length);

    planned.forEach((plan, index) => {
      if (!plan.playerId && !plan.extraId) return;
      const arriveAt = index * stepMs + flightDurationMs;
      const timeout = setTimeout(() => {
        setRuntime(prev => {
          if (prev.key !== dealKey) return prev;
          if (plan.extraId) {
            return {
              ...prev,
              revealedExtras: { ...prev.revealedExtras, [plan.extraId]: true },
            };
          }
          const nextCount = (prev.revealCounts[plan.playerId as string] ?? 0) + 1;
          return {
            ...prev,
            revealCounts: { ...prev.revealCounts, [plan.playerId as string]: nextCount },
          };
        });
      }, arriveAt);
      timeoutsRef.current.push(timeout);
    });

    const lastDelay = (planned.length - 1) * stepMs;
    const cleanupTimeout = setTimeout(() => {
      setRuntime(prev => (prev.key === dealKey ? { ...prev, active: false, flights: [] } : prev));
    }, lastDelay + flightDurationMs + DEAL_ANIMATION_TAIL_MS);
    timeoutsRef.current.push(cleanupTimeout);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealKey, reduceMotion, layoutRetry]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  const isDealing = runtime.key === dealKey && runtime.active;

  return {
    isDealing,
    flights: runtime.key === dealKey ? runtime.flights : [],
    dealCenter: runtime.dealCenter,
    revealCounts: runtime.key === dealKey ? runtime.revealCounts : {},
    revealedFor: (playerId, fallback) =>
      isDealing ? (runtime.revealCounts[playerId] ?? 0) : fallback,
    isExtraRevealed: (id) => (isDealing ? runtime.revealedExtras[id] === true : true),
  };
}
