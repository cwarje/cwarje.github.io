import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { GameType, TableEvent, TableEventInput } from '../../networking/types';

export const CARD_TOSS_KIND = 'card-toss';
export const CARD_TOSS_DURATION_MS = 1250;
export const CARD_SPLAT_DURATION_MS = 1900;
const SEAT_SPLAT_DELAY_MS = 100;

const SEAT_SPLAT_SPREAD = { xRadius: 110, yRadius: 90, maxRotate: 45 };
const CENTER_SPLAT_SPREAD = { xRadius: 200, yRadius: 160, maxRotate: 55 };

export interface Point {
  x: number;
  y: number;
}

export interface CardTossTarget {
  playerId: string;
  seatLeft: number;
  seatTop: number;
}

export interface CardTossBurst {
  id: string;
  cardCount: number;
  start: Point;
  end: Point;
}

export interface SplatCardPlacement {
  x: number;
  y: number;
  rotate: number;
}

export interface CardSplat {
  id: string;
  cardCount: number;
  placements: SplatCardPlacement[];
}

export interface SeatCardSplat extends CardSplat {
  point: Point;
}

export interface UseCardTossOptions {
  boardRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLDivElement | null>;
  handContainerRef: RefObject<HTMLDivElement | null>;
  myId: string;
  handCount: number;
  gameType: GameType;
  sendTableEvent?: (event: TableEventInput) => void;
  lastTableEvent?: TableEvent | null;
  enabled?: boolean;
}

export interface SeatPillTossPropsInput {
  playerId: string;
  playerName: string;
  isMe: boolean;
  selfAriaLabel?: string;
  seatLeft: number;
  seatTop: number;
}

function clampTossCardCount(count: number): number {
  return Math.max(0, Math.round(count));
}

export function createRandomSplatPlacements(
  cardCount: number,
  spread: { xRadius: number; yRadius: number; maxRotate: number },
): SplatCardPlacement[] {
  return Array.from({ length: cardCount }, () => ({
    x: (Math.random() * 2 - 1) * spread.xRadius,
    y: (Math.random() * 2 - 1) * spread.yRadius,
    rotate: (Math.random() * 2 - 1) * spread.maxRotate,
  }));
}

export function getTableEventCardCount(event: TableEvent): number {
  const payload = event.payload;
  if (typeof payload !== 'object' || payload === null) return 5;
  const cardCount = (payload as { cardCount?: unknown }).cardCount;
  return typeof cardCount === 'number' ? clampTossCardCount(cardCount) : 5;
}

export function useCardToss({
  boardRef,
  tableRef,
  handContainerRef,
  myId,
  handCount,
  gameType,
  sendTableEvent,
  lastTableEvent,
  enabled = true,
}: UseCardTossOptions) {
  const cosmeticTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cardTossIdRef = useRef(0);
  const [cardTossBursts, setCardTossBursts] = useState<CardTossBurst[]>([]);
  const [cardSplats, setCardSplats] = useState<CardSplat[]>([]);
  const [seatCardSplats, setSeatCardSplats] = useState<SeatCardSplat[]>([]);

  const scheduleCosmeticCleanup = useCallback((callback: () => void, delayMs: number) => {
    const timeout = setTimeout(() => {
      callback();
      cosmeticTimeoutsRef.current = cosmeticTimeoutsRef.current.filter(item => item !== timeout);
    }, delayMs);
    cosmeticTimeoutsRef.current.push(timeout);
  }, []);

  useEffect(() => {
    const timeouts = cosmeticTimeoutsRef.current;
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
      timeouts.length = 0;
    };
  }, []);

  const getBoardPoint = useCallback((clientPoint: Point): Point | null => {
    const boardRect = boardRef.current?.getBoundingClientRect();
    if (!boardRect) return null;
    return {
      x: clientPoint.x - boardRect.left,
      y: clientPoint.y - boardRect.top,
    };
  }, [boardRef]);

  const getCardTossPoints = useCallback((target: CardTossTarget): { start: Point; end: Point } | null => {
    const handRect = handContainerRef.current?.getBoundingClientRect();
    const tableRect = tableRef.current?.getBoundingClientRect();
    if (!handRect || !tableRect) return null;

    const start = getBoardPoint({
      x: handRect.left + handRect.width / 2,
      y: handRect.top + handRect.height * 0.42,
    });
    const end = getBoardPoint({
      x: tableRect.left + (tableRect.width * target.seatLeft) / 100,
      y: tableRect.top + (tableRect.height * target.seatTop) / 100,
    });
    if (!start || !end) return null;
    return { start, end };
  }, [getBoardPoint, handContainerRef, tableRef]);

  const canTossAt = useCallback((playerId: string) => {
    return (
      enabled
      && !!sendTableEvent
      && handCount > 0
      && playerId !== myId
    );
  }, [enabled, sendTableEvent, handCount, myId]);

  const launchCardToss = useCallback((target: CardTossTarget) => {
    if (!canTossAt(target.playerId)) return;
    const points = getCardTossPoints(target);
    if (!points || !sendTableEvent) return;

    cardTossIdRef.current += 1;
    const id = `${myId}-toss-${cardTossIdRef.current}`;
    const cardCount = clampTossCardCount(handCount);
    setCardTossBursts(prev => [...prev, { id, cardCount, ...points }]);
    scheduleCosmeticCleanup(() => {
      setCardTossBursts(prev => prev.filter(burst => burst.id !== id));
    }, CARD_TOSS_DURATION_MS);
    scheduleCosmeticCleanup(() => {
      const splatId = `${id}-seat-splat`;
      setSeatCardSplats(prev => [...prev, {
        id: splatId,
        cardCount,
        point: points.end,
        placements: createRandomSplatPlacements(cardCount, SEAT_SPLAT_SPREAD),
      }]);
      scheduleCosmeticCleanup(() => {
        setSeatCardSplats(prev => prev.filter(splat => splat.id !== splatId));
      }, CARD_SPLAT_DURATION_MS);
    }, SEAT_SPLAT_DELAY_MS);

    sendTableEvent({
      id,
      kind: CARD_TOSS_KIND,
      toPlayerId: target.playerId,
      payload: { cardCount },
    });
  }, [canTossAt, getCardTossPoints, handCount, myId, scheduleCosmeticCleanup, sendTableEvent]);

  useEffect(() => {
    if (
      !lastTableEvent
      || lastTableEvent.gameType !== gameType
      || lastTableEvent.kind !== CARD_TOSS_KIND
      || lastTableEvent.toPlayerId !== myId
      || lastTableEvent.fromPlayerId === myId
    ) {
      return;
    }

    const id = lastTableEvent.id;
    const cardCount = getTableEventCardCount(lastTableEvent);
    setCardSplats(prev => [...prev, {
      id,
      cardCount,
      placements: createRandomSplatPlacements(cardCount, CENTER_SPLAT_SPREAD),
    }]);
    scheduleCosmeticCleanup(() => {
      setCardSplats(prev => prev.filter(splat => splat.id !== id));
    }, CARD_SPLAT_DURATION_MS);
  }, [lastTableEvent, myId, gameType, scheduleCosmeticCleanup]);

  const getSeatPillTossProps = useCallback((input: SeatPillTossPropsInput) => {
    const canToss = canTossAt(input.playerId);
    return {
      onClick: () => launchCardToss({
        playerId: input.playerId,
        seatLeft: input.seatLeft,
        seatTop: input.seatTop,
      }),
      disabled: !canToss,
      'aria-label': input.isMe
        ? (input.selfAriaLabel ?? 'Your seat')
        : `Throw cards at ${input.playerName}`,
    };
  }, [canTossAt, launchCardToss]);

  const isThrowingCards = cardTossBursts.length > 0;

  return {
    cardTossBursts,
    seatCardSplats,
    cardSplats,
    launchCardToss,
    canTossAt,
    isThrowingCards,
    getSeatPillTossProps,
  };
}
