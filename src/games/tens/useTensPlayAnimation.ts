import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Card, SelectedCardPlay, TensActionAnnouncement, TensPlayOutcome, TensState } from './types';
import { cardEquals } from './rules';
import {
  CENTER_HOLD_MS,
  CLEAR_HOLD_MS,
  FLY_DURATION_MS,
  OUTCOME_FLY_DURATION_MS,
  OUTCOME_STAGGER_MS,
  PLAY_STAGGER_MS,
  centerStackDisplayIndex,
  centerStackOffset,
  getElementMetrics,
  type Point,
} from './tensAnimMetrics';

export interface TensPlayFlight {
  id: string;
  card: Card;
  from: Point;
  to: Point;
  width: number;
  height: number;
  delayMs: number;
  durationMs: number;
}

export interface TensPlayAnimation {
  id: string;
  phase: 'playFly' | 'centerHold' | 'outcomeFly';
  playFlights: TensPlayFlight[];
  outcomeFlights: TensPlayFlight[];
  outcome: TensPlayOutcome;
  /** Full center pile after play, before pickup/clear — shown during centerHold. */
  centerAfterPlay: Card[];
  /** Cards played this turn — hide from static center while playFly runs. */
  playedCards: Card[];
  /** Discard pile count before this clear — badge stays here until fly-out completes. */
  discardCountBeforeClear: number;
  /** Player who picked up (pickup outcome only). */
  pickupPlayerId?: string;
}

export interface TensHandLayoutMetrics {
  cardWidth: number;
  cardHeight: number;
  step: number;
}

function playKey(play: SelectedCardPlay): string {
  return `${play.source}-${play.pileIndex ?? 'h'}-${play.card.suit}-${play.card.rank}`;
}

function announcementId(ann: TensActionAnnouncement): string {
  return `${ann.playerId}-${ann.plays.map(p => playKey(p)).join('|')}-${ann.outcome}`;
}

function defaultCardSize(): { width: number; height: number } {
  return { width: 56, height: 82 };
}

function isClearOutcome(outcome: TensPlayOutcome): boolean {
  return outcome === 'set-clear' || outcome === 'wild-clear';
}

function clearDiscardCountBefore(
  ann: TensActionAnnouncement,
  fallback: number,
): number {
  return ann.discardCountBeforeClear ?? Math.max(0, fallback - ann.centerAfterPlay.length);
}

function removeMatchingCards(hand: Card[], toRemove: Card[]): Card[] {
  const result = [...hand];
  for (const card of toRemove) {
    const idx = result.findIndex(c => cardEquals(c, card));
    if (idx >= 0) result.splice(idx, 1);
  }
  return result;
}

export function useTensPlayAnimation(options: {
  boardRef: RefObject<HTMLDivElement | null>;
  centerRef: RefObject<HTMLElement | null>;
  discardRef: RefObject<HTMLElement | null>;
  handContainerRef: RefObject<HTMLElement | null>;
  pileRefs: RefObject<Map<string, HTMLButtonElement>>;
  seatRefs: RefObject<Map<string, HTMLButtonElement>>;
  handLayout: TensHandLayoutMetrics;
  myId: string;
  state: TensState;
  animationBusyRef: MutableRefObject<boolean>;
}) {
  const {
    boardRef,
    centerRef,
    discardRef,
    handContainerRef,
    pileRefs,
    seatRefs,
    handLayout,
    myId,
    state,
    animationBusyRef,
  } = options;

  const reduceMotion = useReducedMotion();
  const prevStateRef = useRef(state);
  const animationRef = useRef<TensPlayAnimation | null>(null);
  const [animation, setAnimation] = useState<TensPlayAnimation | null>(null);
  const [revealedClearAnnouncementId, setRevealedClearAnnouncementId] = useState<string | null>(null);
  const [revealedPickupAnnouncementId, setRevealedPickupAnnouncementId] = useState<string | null>(null);
  const [pendingClearDiscard, setPendingClearDiscard] = useState<{ id: string; count: number } | null>(null);
  const pendingClearDiscardRef = useRef(pendingClearDiscard);
  const lastStartedIdRef = useRef<string | null>(null);
  const outcomeFlyCompleteRef = useRef(false);

  useEffect(() => {
    animationRef.current = animation;
  }, [animation]);

  const completeAnimation = useCallback(() => {
    setAnimation(null);
    animationBusyRef.current = false;
  }, [animationBusyRef]);

  const advanceToCenterHold = useCallback(() => {
    setAnimation(prev => (prev && prev.phase === 'playFly' ? { ...prev, phase: 'centerHold' } : prev));
  }, []);

  const advanceToOutcome = useCallback(() => {
    setAnimation(prev => {
      if (!prev || prev.phase !== 'centerHold' || prev.outcome === 'normal') return prev;
      return { ...prev, phase: 'outcomeFly' };
    });
  }, []);

  const resolveHandSource = useCallback((
    playerId: string,
    play: SelectedCardPlay,
    prevState: TensState,
  ): ReturnType<typeof getElementMetrics> => {
    const prevPlayer = prevState.players.find(p => p.id === playerId);
    if (!prevPlayer) return null;

    const handIndex = prevPlayer.hand.findIndex(c => cardEquals(c, play.card));
    if (handIndex < 0) return null;

    if (playerId === myId) {
      const container = handContainerRef.current;
      const boardRect = boardRef.current?.getBoundingClientRect();
      if (!container || !boardRect) return null;
      const containerRect = container.getBoundingClientRect();
      const { cardWidth, cardHeight, step } = handLayout;
      const x = containerRect.left + handIndex * step + cardWidth / 2 - boardRect.left;
      const y = containerRect.top + cardHeight / 2 - boardRect.top;
      return { center: { x, y }, width: cardWidth, height: cardHeight };
    }

    const seatEl = seatRefs.current?.get(playerId);
    const seatMetrics = getElementMetrics(boardRef, seatEl ?? null);
    if (!seatMetrics) return null;
    return {
      center: { x: seatMetrics.center.x, y: seatMetrics.center.y - 36 },
      width: 0,
      height: 0,
    };
  }, [boardRef, handContainerRef, handLayout, myId, seatRefs]);

  const resolveSourceMetrics = useCallback((
    playerId: string,
    play: SelectedCardPlay,
    prevState: TensState,
  ): ReturnType<typeof getElementMetrics> => {
    if (play.source === 'hand') {
      return resolveHandSource(playerId, play, prevState);
    }
    const pileKey = `${playerId}-${play.pileIndex ?? 0}`;
    const pileEl = pileRefs.current?.get(pileKey);
    return getElementMetrics(boardRef, pileEl ?? null);
  }, [boardRef, pileRefs, resolveHandSource]);

  useLayoutEffect(() => {
    pendingClearDiscardRef.current = pendingClearDiscard;
  }, [pendingClearDiscard]);

  useLayoutEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    const ann = state.actionAnnouncement;
    if (ann && isClearOutcome(ann.outcome) && state.phase === 'announcement') {
      const animId = announcementId(ann);
      const prevAnn = prev.actionAnnouncement;
      const isNewClear =
        prev.phase !== 'announcement' ||
        !prevAnn ||
        announcementId(prevAnn) !== animId;
      if (isNewClear) {
        setPendingClearDiscard({
          id: animId,
          count: clearDiscardCountBefore(ann, prev.discardCount),
        });
      }
    }

    if (
      prev.phase === 'announcement' &&
      state.phase !== 'announcement' &&
      !animationRef.current &&
      !animationBusyRef.current
    ) {
      const pending = pendingClearDiscardRef.current;
      if (pending) {
        setRevealedClearAnnouncementId(pending.id);
        setPendingClearDiscard(null);
      }
    }

    if (animationRef.current || animationBusyRef.current) return;
    if (state.phase !== 'announcement' || !ann) return;
    if (prev.phase === 'announcement' && prev.actionAnnouncement &&
      announcementId(prev.actionAnnouncement) === announcementId(ann)) {
      return;
    }

    const animId = announcementId(ann);
    if (lastStartedIdRef.current === animId) return;

    if (reduceMotion) return;

    outcomeFlyCompleteRef.current = false;

    const centerMetrics = getElementMetrics(boardRef, centerRef);
    if (!centerMetrics) return;

    lastStartedIdRef.current = animId;

    const cardSize = defaultCardSize();
    const centerTarget: Point = centerMetrics.center;
    const flyWidth = centerMetrics.width || cardSize.width;
    const flyHeight = centerMetrics.height || cardSize.height;

    const playFlights: TensPlayFlight[] = [];
    const prevCenterLength = prev.centerPile.length;
    const fullPileLength = ann.centerAfterPlay.length;
    const playsToAnimate = prev.phase === 'reveal-follow-up'
      ? ann.plays.filter(p => p.source === 'hand')
      : ann.plays;
    let flightIndex = 0;
    for (let i = 0; i < ann.plays.length; i++) {
      const play = ann.plays[i]!;
      if (prev.phase === 'reveal-follow-up' && play.source !== 'hand') {
        continue;
      }
      const sourceMetrics = resolveSourceMetrics(ann.playerId, play, prev) ?? {
        center: centerTarget,
        width: flyWidth,
        height: flyHeight,
      };
      const stackIndex = prevCenterLength + flightIndex;
      flightIndex += 1;
      const stackOffset = centerStackOffset(centerStackDisplayIndex(fullPileLength, stackIndex));
      playFlights.push({
        id: `play-${playKey(play)}`,
        card: play.card,
        from: sourceMetrics.center,
        to: {
          x: centerTarget.x + stackOffset.x,
          y: centerTarget.y + stackOffset.y,
        },
        width: flyWidth,
        height: flyHeight,
        delayMs: (flightIndex - 1) * PLAY_STAGGER_MS,
        durationMs: FLY_DURATION_MS,
      });
    }

    const outcomeFlights: TensPlayFlight[] = [];
    if (ann.outcome !== 'normal') {
      let destMetrics = null as ReturnType<typeof getElementMetrics>;
      if (ann.outcome === 'pickup') {
        if (ann.playerId === myId) {
          destMetrics = getElementMetrics(boardRef, handContainerRef);
        } else {
          destMetrics = getElementMetrics(boardRef, seatRefs.current?.get(ann.playerId) ?? null);
        }
      } else {
        destMetrics = getElementMetrics(boardRef, discardRef);
      }

      const dest = destMetrics?.center ?? centerTarget;
      const cards = ann.centerAfterPlay;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]!;
        const stackOffset = centerStackOffset(centerStackDisplayIndex(cards.length, i));
        outcomeFlights.push({
          id: `outcome-${card.suit}-${card.rank}-${i}`,
          card,
          from: {
            x: centerTarget.x + stackOffset.x,
            y: centerTarget.y + stackOffset.y,
          },
          to: dest,
          width: flyWidth,
          height: flyHeight,
          delayMs: i * OUTCOME_STAGGER_MS,
          durationMs: OUTCOME_FLY_DURATION_MS,
        });
      }
    }

    animationBusyRef.current = true;
    setAnimation({
      id: animId,
      phase: 'playFly',
      playFlights,
      outcomeFlights,
      outcome: ann.outcome,
      centerAfterPlay: ann.centerAfterPlay,
      playedCards: playsToAnimate.map(p => p.card),
      discardCountBeforeClear: isClearOutcome(ann.outcome)
        ? clearDiscardCountBefore(ann, prev.discardCount)
        : 0,
      pickupPlayerId: ann.outcome === 'pickup' ? ann.playerId : undefined,
    });
  }, [
    state,
    boardRef,
    centerRef,
    discardRef,
    handContainerRef,
    seatRefs,
    resolveSourceMetrics,
    reduceMotion,
    animationBusyRef,
  ]);

  useEffect(() => {
    if (!animation || animation.phase !== 'playFly') return;
    const maxDelay = animation.playFlights.reduce((max, f) => Math.max(max, f.delayMs), 0);
    const totalMs = maxDelay + FLY_DURATION_MS;
    const timer = setTimeout(advanceToCenterHold, totalMs);
    return () => clearTimeout(timer);
  }, [animation, advanceToCenterHold]);

  useEffect(() => {
    if (!animation || animation.phase !== 'centerHold') return;
    const holdMs =
      animation.outcome === 'set-clear' || animation.outcome === 'wild-clear'
        ? CLEAR_HOLD_MS
        : CENTER_HOLD_MS;
    const timer = setTimeout(() => {
      if (animation.outcome === 'normal') {
        completeAnimation();
      } else {
        advanceToOutcome();
      }
    }, holdMs);
    return () => clearTimeout(timer);
  }, [animation, advanceToOutcome, completeAnimation]);

  const handleOutcomeFlyComplete = useCallback(() => {
    const anim = animationRef.current;
    if (!anim || anim.phase !== 'outcomeFly' || outcomeFlyCompleteRef.current) return;
    outcomeFlyCompleteRef.current = true;

    if (anim.outcome === 'pickup' && anim.pickupPlayerId === myId) {
      setRevealedPickupAnnouncementId(anim.id);
    }
    if (isClearOutcome(anim.outcome)) {
      setRevealedClearAnnouncementId(anim.id);
      setPendingClearDiscard(null);
    }
    completeAnimation();
  }, [completeAnimation, myId]);

  useEffect(() => {
    if (!animation || animation.phase !== 'outcomeFly') return;
    const maxDelay = animation.outcomeFlights.reduce((max, f) => Math.max(max, f.delayMs), 0);
    const totalMs = maxDelay + OUTCOME_FLY_DURATION_MS + 200;
    const timer = setTimeout(handleOutcomeFlyComplete, totalMs);
    return () => clearTimeout(timer);
  }, [animation, handleOutcomeFlyComplete]);

  const hideCenterCards = useCallback((card: Card): boolean => {
    if (!animation) return false;
    if (animation.phase === 'centerHold') return false;
    if (animation.phase === 'outcomeFly') {
      return animation.centerAfterPlay.some(c => cardEquals(c, card));
    }
    return animation.playedCards.some(c => cardEquals(c, card));
  }, [animation]);

  const displayCenterPile = useMemo((): Card[] => {
    if (animation && animation.outcome !== 'normal') {
      return animation.centerAfterPlay;
    }
    return state.centerPile;
  }, [animation, state.centerPile]);

  const hidePlaySource = useCallback((playerId: string, play: SelectedCardPlay): boolean => {
    if (!animation || animation.phase !== 'playFly') return false;
    if (state.actionAnnouncement?.playerId !== playerId) return false;
    return state.actionAnnouncement.plays.some(
      p => playKey(p) === playKey(play),
    );
  }, [animation, state.actionAnnouncement]);

  const displayDiscardCount = useMemo((): number => {
    if (reduceMotion) return state.discardCount;

    const anim = animation;
    if (anim && isClearOutcome(anim.outcome) && revealedClearAnnouncementId !== anim.id) {
      return anim.discardCountBeforeClear;
    }

    if (pendingClearDiscard && revealedClearAnnouncementId === pendingClearDiscard.id) {
      return state.discardCount;
    }

    if (pendingClearDiscard && revealedClearAnnouncementId !== pendingClearDiscard.id) {
      return pendingClearDiscard.count;
    }

    const ann = state.actionAnnouncement;
    if (ann && isClearOutcome(ann.outcome)) {
      const annId = announcementId(ann);
      if (revealedClearAnnouncementId !== annId) {
        return clearDiscardCountBefore(ann, state.discardCount);
      }
    }

    return state.discardCount;
  }, [
    animation,
    pendingClearDiscard,
    revealedClearAnnouncementId,
    reduceMotion,
    state.discardCount,
    state.actionAnnouncement,
  ]);

  const displayMyHand = useMemo((): Card[] | null => {
    const me = state.players.find(p => p.id === myId);
    if (!me) return null;
    const ann = state.actionAnnouncement;
    if (
      ann?.outcome === 'pickup' &&
      ann.playerId === myId &&
      state.phase === 'announcement' &&
      !reduceMotion &&
      revealedPickupAnnouncementId !== announcementId(ann)
    ) {
      return removeMatchingCards(me.hand, ann.centerAfterPlay);
    }
    return me.hand;
  }, [
    state.players,
    state.actionAnnouncement,
    state.phase,
    myId,
    revealedPickupAnnouncementId,
    reduceMotion,
  ]);

  return {
    animation,
    hideCenterCards,
    hidePlaySource,
    displayCenterPile,
    displayDiscardCount,
    displayMyHand,
    handleOutcomeFlyComplete,
  };
}
