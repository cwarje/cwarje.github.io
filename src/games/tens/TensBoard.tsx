import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { TableEvent, TableEventInput } from '../../networking/types';
import type { Card, SelectedCardPlay, TensActionAnnouncement, TensPlayer, TensState } from './types';
import {
  allPileTopsPlayed,
  cardEquals,
  getPilePlayableCard,
  listLegalPlayGroups,
  rankDisplay,
  validatePlays,
} from './rules';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import { useDealerDealAnimation, type DealExtraTarget, type DealSeat } from '../shared/useDealerDealAnimation';
import { DealAnimationLayer } from '../shared/DealAnimationLayer';
import { CardTossLayers } from '../shared/CardTossLayers';
import { useCardToss } from '../shared/useCardToss';
import { CardFace } from '../shared/ui/CardFace';
import { FlipCard } from '../shared/ui/FlipCard';
import { RadialSeatName } from '../shared/ui/RadialSeatName';
import { SUIT_COLORS, SUIT_SYMBOLS } from '../shared/ui/cardConstants';
import { TensPlayAnimationLayer } from './TensPlayAnimationLayer';
import { useTensPlayAnimation } from './useTensPlayAnimation';

interface TensBoardProps {
  state: TensState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
  sendTableEvent?: (event: TableEventInput) => void;
  lastTableEvent?: TableEvent | null;
}

interface SeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: TensPlayer;
  seatLeft: number;
  seatTop: number;
}

interface ElementSize {
  width: number;
  height: number;
}

const SEAT_EDGE_GAP_PX = 8;
const SEAT_RADIUS_Y_SCALE = 0.9;
const OPPONENT_HAND_CARD_WIDTH = 45;
const OPPONENT_HAND_CARD_HEIGHT = 68;
const OPPONENT_HAND_MAX_SPREAD = 160;

interface OpponentHandLayout {
  cardWidth: number;
  cardHeight: number;
  step: number;
  spreadWidth: number;
}

function getOpponentHandLayout(cardCount: number): OpponentHandLayout {
  const cardWidth = OPPONENT_HAND_CARD_WIDTH;
  const cardHeight = OPPONENT_HAND_CARD_HEIGHT;
  const defaultStep = Math.round(cardWidth * 0.58);
  const fitStep = cardCount > 1 ? (OPPONENT_HAND_MAX_SPREAD - cardWidth) / (cardCount - 1) : defaultStep;
  const step = cardCount > 1 ? Math.max(8, Math.min(defaultStep, fitStep)) : defaultStep;
  const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
  return { cardWidth, cardHeight, step, spreadWidth };
}

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount >= 9) return { seatRadiusX: 44, seatRadiusY: 38 };
  if (playerCount >= 7) return { seatRadiusX: 42, seatRadiusY: 36 };
  if (playerCount >= 6) return { seatRadiusX: 40, seatRadiusY: 34 };
  if (playerCount === 5) return { seatRadiusX: 37, seatRadiusY: 32 };
  if (playerCount === 4) return { seatRadiusX: 35, seatRadiusY: 30 };
  if (playerCount === 3) return { seatRadiusX: 35, seatRadiusY: 30 };
  return { seatRadiusX: 30, seatRadiusY: 29 };
}

function handCardKey(handIndex: number): string {
  return `hand-${handIndex}`;
}

function cardKey(card: Card, source: SelectedCardPlay['source'], pileIndex?: number): string {
  return `${source}-${pileIndex ?? 'h'}-${card.suit}-${card.rank}`;
}

function headsUpCardSpan(card: Card): ReactNode {
  return (
    <span className={SUIT_COLORS[card.suit]}>
      {rankDisplay(card.rank)}
      {SUIT_SYMBOLS[card.suit]}
    </span>
  );
}

function playedCardsHudMessage(cards: Card[]): ReactNode {
  if (cards.length === 1) return headsUpCardSpan(cards[0]!);
  const rank = cards[0]?.rank;
  const countWords = ['', 'one', 'two', 'three', 'four'];
  const countLabel = countWords[cards.length] ?? String(cards.length);
  return `${countLabel} ${rankDisplay(rank ?? 0)}s`;
}

function announcementHudMessage(
  ann: TensActionAnnouncement,
  actor: TensPlayer,
  myId: string,
): ReactNode {
  const displayName = actor.id === myId ? 'You' : actor.name;
  const nameEl = <span style={{ color: getPlayerHudTextColor(actor.color) }}>{displayName}</span>;
  const playedCards = ann.plays.map(p => p.card);
  const extraTurnSuffix = ann.outcome !== 'normal' ? ' · plays again' : '';

  if (ann.outcome === 'pickup') {
    const pickupCount = ann.centerAfterPlay.length;
    const cardWord = pickupCount === 1 ? 'card' : 'cards';
    return (
      <>
        {nameEl}
        {' played '}
        {playedCardsHudMessage(playedCards)}
        {` and picked up ${pickupCount} ${cardWord}${extraTurnSuffix}`}
      </>
    );
  }

  if (ann.outcome === 'set-clear') {
    const rank = ann.plays[0]?.card.rank;
    return (
      <>
        {nameEl}
        {` cleared with four ${rankDisplay(rank ?? 0)}s${extraTurnSuffix}`}
      </>
    );
  }

  if (ann.outcome === 'wild-clear') {
    return (
      <>
        {nameEl}
        {' played '}
        {playedCardsHudMessage(playedCards)}
        {` and cleared${extraTurnSuffix}`}
      </>
    );
  }

  return (
    <>
      {nameEl}
      {' played '}
      {playedCardsHudMessage(playedCards)}
    </>
  );
}

function TensFlipCard({ card, faceDown, disabled = false }: { card?: Card | null; faceDown: boolean; disabled?: boolean }) {
  return <FlipCard card={card ?? undefined} faceDown={faceDown || !card} disabled={disabled} size="sm" />;
}

function matchesSelectedPlay(
  entry: { card: Card; source: SelectedCardPlay['source']; pileIndex?: number },
  play: SelectedCardPlay,
): boolean {
  if (!cardEquals(entry.card, play.card)) return false;
  if (entry.source !== play.source) return false;
  if (play.source === 'hand') return true;
  return entry.pileIndex === play.pileIndex;
}

function remainingPlaySlots(
  groupPlays: { card: Card; source: SelectedCardPlay['source']; pileIndex?: number }[],
  selectedPlays: SelectedCardPlay[],
) {
  const remaining = [...groupPlays];
  for (const play of selectedPlays) {
    const idx = remaining.findIndex(entry => matchesSelectedPlay(entry, play));
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining;
}

export default function TensBoard({
  state,
  myId,
  onAction,
  isHandZoomed = false,
  sendTableEvent,
  lastTableEvent,
}: TensBoardProps) {
  const myIndex = state.players.findIndex(p => p.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = myIndex >= 0 && state.currentPlayerIndex === myIndex;
  const boardRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const pileRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const seatRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const animationBusyRef = useRef(false);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLButtonElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const reduceMotion = useReducedMotion();

  const {
    cardTossBursts,
    seatCardSplats,
    cardSplats,
    isThrowingCards,
    getSeatPillTossProps,
  } = useCardToss({
    boardRef,
    tableRef,
    handContainerRef,
    myId,
    handCount: myPlayer?.hand.length ?? 0,
    gameType: 'tens',
    sendTableEvent,
    lastTableEvent,
  });

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [state.currentPlayerIndex, state.phase, state.roundNumber]);

  const seatLayouts = useMemo<SeatLayout[]>(() => {
    const playerCount = state.players.length;
    if (playerCount === 0) return [];
    const fallbackRadii = getLayoutRadii(playerCount);
    const canUseMeasuredRadii =
      tableSize.width > 0 &&
      tableSize.height > 0 &&
      seatPillSize.width > 0 &&
      seatPillSize.height > 0;
    const radii = canUseMeasuredRadii
      ? (() => {
          const usableHalfWidth = tableSize.width / 2 - seatPillSize.width / 2 - SEAT_EDGE_GAP_PX;
          const usableHalfHeight = tableSize.height / 2 - seatPillSize.height / 2 - SEAT_EDGE_GAP_PX;
          return {
            seatRadiusX: Math.max(0, Math.min(50, (usableHalfWidth / tableSize.width) * 100)),
            seatRadiusY: Math.max(0, Math.min(50, (usableHalfHeight / tableSize.height) * 100)),
          };
        })()
      : fallbackRadii;
    const scaledRadii = {
      seatRadiusX: radii.seatRadiusX,
      seatRadiusY: radii.seatRadiusY * SEAT_RADIUS_Y_SCALE,
    };

    return Array.from({ length: playerCount }, (_, relativeIndex) => {
      const playerIndex = (anchorIndex + relativeIndex) % playerCount;
      const player = state.players[playerIndex];
      const angle = 90 + (360 * relativeIndex) / playerCount;
      const angleInRadians = (angle * Math.PI) / 180;
      return {
        relativeIndex,
        playerIndex,
        player,
        seatLeft: 50 + scaledRadii.seatRadiusX * Math.cos(angleInRadians),
        seatTop: 50 + scaledRadii.seatRadiusY * Math.sin(angleInRadians),
      };
    }).filter(layout => !!layout.player);
  }, [state.players, anchorIndex, tableSize.width, tableSize.height, seatPillSize.width, seatPillSize.height]);

  const dealSeats = useMemo<DealSeat[]>(
    () =>
      seatLayouts.map(layout => ({
        playerId: layout.player.id,
        isSelf: layout.relativeIndex === 0,
        seatLeft: layout.seatLeft,
        seatTop: layout.seatTop,
        count: layout.player.hand.length,
      })),
    [seatLayouts],
  );

  const dealExtras = useMemo<DealExtraTarget[]>(() => {
    const extras: DealExtraTarget[] = [];
    for (const layout of seatLayouts) {
      layout.player.tablePiles.forEach((pile, pileIndex) => {
        if (pile.bottomCard) {
          extras.push({
            id: `${layout.player.id}-pile-${pileIndex}-bottom`,
            seatLeft: layout.seatLeft,
            seatTop: layout.seatTop,
            faceUp: false,
          });
        }
        if (pile.topCard) {
          extras.push({
            id: `${layout.player.id}-pile-${pileIndex}-top`,
            seatLeft: layout.seatLeft,
            seatTop: layout.seatTop,
            faceUp: false,
          });
        }
      });
    }
    return extras;
  }, [seatLayouts]);

  const deal = useDealerDealAnimation({
    boardRef,
    tableRef,
    dealKey: String(state.roundNumber),
    seats: dealSeats,
    extraTargets: dealExtras,
  });

  const myHandForLayout = useMemo((): Card[] => {
    if (!myPlayer) return [];
    const ann = state.actionAnnouncement;
    if (
      ann?.outcome === 'pickup' &&
      ann.playerId === myId &&
      state.phase === 'announcement'
    ) {
      const withoutPickup = [...myPlayer.hand];
      for (const card of ann.centerAfterPlay) {
        const idx = withoutPickup.findIndex(c => cardEquals(c, card));
        if (idx >= 0) withoutPickup.splice(idx, 1);
      }
      return withoutPickup;
    }
    return myPlayer.hand;
  }, [myPlayer, state.actionAnnouncement, state.phase, myId]);

  useEffect(() => {
    const el = handContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setHandWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
      setTableSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = seatPillElement;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
      setSeatPillSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seatPillElement]);

  const handLayout = useMemo(() => {
    const cardCount = myHandForLayout.length;
    const cardWidth = Math.min(92, Math.max(64, Math.floor(handWidth / 6)));
    const cardHeight = Math.round(cardWidth * 1.45);
    const defaultStep = Math.round(cardWidth * 0.52);
    const maxSpread = Math.max(cardWidth, handWidth - 16);
    const fitStep = cardCount > 1 ? (maxSpread - cardWidth) / (cardCount - 1) : defaultStep;
    const step = cardCount > 1 ? Math.max(14, Math.min(defaultStep, fitStep)) : defaultStep;
    const spreadWidth = cardCount > 1 ? cardWidth + step * (cardCount - 1) : cardWidth;
    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [myHandForLayout.length, handWidth]);

  const playAnim = useTensPlayAnimation({
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
  });

  const myHandCards = playAnim.displayMyHand ?? myPlayer?.hand ?? [];
  const myRevealCount = deal.revealedFor(myId, myHandCards.length);
  const visibleHand = myPlayer ? myHandCards.slice(0, myRevealCount) : [];

  const setPileRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) pileRefs.current.set(key, el);
    else pileRefs.current.delete(key);
  }, []);

  const setSeatRef = useCallback((playerId: string, el: HTMLButtonElement | null) => {
    if (el) seatRefs.current.set(playerId, el);
    else seatRefs.current.delete(playerId);
  }, []);

  const canInteract =
    !deal.isDealing &&
    isMyTurn &&
    state.phase === 'playing';

  const hasActionButtons = canInteract && !!myPlayer;

  const selectedPlays = useMemo((): SelectedCardPlay[] => {
    if (!myPlayer) return [];
    const allTopsPlayed = allPileTopsPlayed(myPlayer);
    const plays: SelectedCardPlay[] = [];
    visibleHand.forEach((card, handIndex) => {
      const key = handCardKey(handIndex);
      if (selectedKeys.has(key)) plays.push({ card, source: 'hand' });
    });
    myPlayer.tablePiles.forEach((pile, pileIndex) => {
      const playable = getPilePlayableCard(pile, { allTopsPlayed });
      if (!playable) return;
      const source = playable.fromTop ? 'pile-top' as const : 'pile-bottom' as const;
      const key = cardKey(playable.card, source, pileIndex);
      if (selectedKeys.has(key)) plays.push({ card: playable.card, source, pileIndex });
    });
    return plays;
  }, [myPlayer, selectedKeys, visibleHand]);

  const canSubmitPlay = useMemo(() => {
    if (!canInteract || myIndex < 0 || selectedPlays.length === 0) return false;
    return validatePlays(state, myIndex, selectedPlays);
  }, [canInteract, myIndex, selectedPlays, state]);

  const legalGroups = useMemo(() => {
    if (myIndex < 0) return [];
    return listLegalPlayGroups(state, myIndex);
  }, [state, myIndex]);

  const isCardSelectable = (
    card: Card,
    source: SelectedCardPlay['source'],
    pileIndex?: number,
    handIndex?: number,
  ): boolean => {
    if (!canInteract || !myPlayer) return false;
    const key = source === 'hand' ? handCardKey(handIndex ?? -1) : cardKey(card, source, pileIndex);
    if (selectedKeys.has(key)) return true;
    if (selectedPlays.length >= 4) return false;

    if (selectedPlays.length === 0) {
      return legalGroups.some(group =>
        group.plays.some(p =>
          p.source === source &&
          (source === 'hand' || p.pileIndex === pileIndex) &&
          cardEquals(p.card, card),
        ),
      );
    }

    const hasPileBottomSelection = selectedPlays.some(p => p.source === 'pile-bottom');
    const hasHandSelection = selectedPlays.some(p => p.source === 'hand');
    if (source === 'hand' && hasPileBottomSelection) return false;
    if (source === 'pile-bottom' && hasHandSelection) return false;

    const selectedRank = selectedPlays[0]?.card.rank;
    if (card.rank !== selectedRank) return false;

    const group = legalGroups.find(g => g.rank === selectedRank);
    if (!group) return false;

    const remaining = remainingPlaySlots(group.plays, selectedPlays);
    return remaining.some(p =>
      p.source === source &&
      (source === 'hand' || p.pileIndex === pileIndex) &&
      cardEquals(p.card, card),
    );
  };

  const toggleSelection = (
    card: Card,
    source: SelectedCardPlay['source'],
    pileIndex?: number,
    handIndex?: number,
  ) => {
    const key = source === 'hand' ? handCardKey(handIndex ?? -1) : cardKey(card, source, pileIndex);
    if (!isCardSelectable(card, source, pileIndex, handIndex) && !selectedKeys.has(key)) return;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submitPlay = () => {
    if (!canSubmitPlay) return;
    onAction({ type: 'play-cards', plays: selectedPlays });
    setSelectedKeys(new Set());
  };

  const headsUpContent = useMemo((): ReactNode => {
    if (state.phase === 'round-end') {
      return state.roundSummary || 'Round over';
    }

    if (state.phase === 'announcement' && state.actionAnnouncement) {
      const actor = state.players.find(p => p.id === state.actionAnnouncement?.playerId);
      if (!actor) return null;
      return announcementHudMessage(state.actionAnnouncement, actor, myId);
    }

    const current = state.players[state.currentPlayerIndex];
    if (!current) return null;
    const turnLabel = current.id === myId ? 'Your turn' : `${current.name}'s turn`;
    if (state.lastPlayRank === null) return turnLabel;
    return `${turnLabel} · Must play ${rankDisplay(state.lastPlayRank)} or lower`;
  }, [state, myId]);

  const renderOpponentHandFan = (player: TensPlayer) => {
    const fullCount = player.hand.length;
    const cardCount = deal.revealedFor(player.id, fullCount);
    if (cardCount === 0) return null;

    const layout = getOpponentHandLayout(cardCount);

    return (
      <div
        className="twelve-opponentHandSpread"
        aria-label={`${player.name}, ${fullCount} cards in hand`}
        style={{
          width: `${layout.spreadWidth}px`,
          height: `${layout.cardHeight}px`,
          transition: 'width 0.16s ease',
        }}
      >
        <AnimatePresence initial={false}>
          {Array.from({ length: cardCount }, (_, i) => {
            const isLast = i === cardCount - 1;
            const hitboxWidth = isLast ? layout.cardWidth : layout.step;
            return (
              <motion.div
                key={`${player.id}-hand-slot-${i}`}
                className="twelve-opponentHandHitbox"
                style={{
                  left: `${i * layout.step}px`,
                  width: `${hitboxWidth}px`,
                  height: `${layout.cardHeight}px`,
                  zIndex: i + 1,
                }}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 12, scale: 0.85 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                <span
                  className="twelve-opponentHandCardWrap"
                  style={{ width: `${layout.cardWidth}px`, height: `${layout.cardHeight}px` }}
                >
                  <div className="card-back" />
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  };

  const renderSeatPill = (seatLayout: SeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === player.id
      && state.phase === 'playing';
    const isMe = player.id === myId;
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const canTossCards = !!sendTableEvent && !!myPlayer && myPlayer.hand.length > 0 && !isMe;
    const tossProps = getSeatPillTossProps({
      playerId: player.id,
      playerName: player.name,
      isMe,
      selfAriaLabel: `Your seat, ${player.totalScore} points`,
      seatLeft: seatLayout.seatLeft,
      seatTop: seatLayout.seatTop,
    });

    return (
      <button
        type="button"
        ref={(el) => {
          setSeatRef(player.id, el);
          if (shouldMeasure) setSeatPillElement(el);
        }}
        onClick={tossProps.onClick}
        disabled={!canTossCards}
        className={`radial-seatPill card-toss-seatPillButton tens-seatPill ${isCurrentTurn ? (isMe ? 'radial-seatPill--activeSelf' : 'radial-seatPill--activeOther') : ''} ${isMe ? 'radial-seatPill--me' : ''}`}
        aria-label={tossProps['aria-label']}
      >
        <div className="radial-seatPillTop tens-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <RadialSeatName name={isMe ? 'You' : player.name} textColor={seatTextColor} />
        </div>
        <div className="tens-seatScoreRow">
          <span>{player.totalScore} pts</span>
        </div>
      </button>
    );
  };

  if (state.phase === 'game-over') {
    const sorted = [...state.players].sort((a, b) => a.totalScore - b.totalScore);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="radial-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <div className="space-y-2 w-full max-w-md">
          {sorted.map((player, i) => (
            <div key={player.id} className="flex justify-between rounded-xl bg-white/10 px-4 py-2 text-white">
              <span>{i + 1}. {player.id === myId ? 'You' : player.name}</span>
              <span className="font-semibold">{player.totalScore}</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  const visibleCenter = playAnim.displayCenterPile.slice(-8).filter(card => !playAnim.hideCenterCards(card));

  const renderCenterCardFace = (card: Card) => (
    <div className="radial-slotCard">
      <div className="radial-slotCardInner">
        <CardFace card={card} compact />
      </div>
    </div>
  );

  return (
    <div
      ref={boardRef}
      className={`tens-board radial-board radial-board--players-${state.players.length} tens-board--players-${state.players.length} relative space-y-3 sm:space-y-4`}
    >
      <DealAnimationLayer flights={deal.flights} dealCenter={deal.dealCenter} remaining={deal.flights.length} />
      <TensPlayAnimationLayer
        animation={playAnim.animation}
        renderCardFace={renderCenterCardFace}
        centerZoom={isHandZoomed}
        onOutcomeFlyComplete={playAnim.handleOutcomeFlyComplete}
      />
      <CardTossLayers cardTossBursts={cardTossBursts} seatCardSplats={seatCardSplats} cardSplats={cardSplats} />

      <div ref={tableRef} className={`radial-table radial-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`radial-seat ${layout.relativeIndex === 0 ? 'radial-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            <div className={`twelve-seatStack ${isHandZoomed ? 'twelve-seatStack--zoom' : ''}`}>
              <div className="twelve-seatPillCluster">
                {layout.player.id !== myId && renderOpponentHandFan(layout.player)}
                {renderSeatPill(layout, layout.relativeIndex === 0)}
              </div>
              <div className="twelve-pileRow">
                {layout.player.tablePiles.map((pile, pileIndex) => {
                  const allTopsPlayed = allPileTopsPlayed(layout.player);
                  const playable = getPilePlayableCard(pile, { allTopsPlayed });
                  const isMyPile = layout.player.id === myId;
                  const bottomShown =
                    !!pile.bottomCard && deal.isExtraRevealed(`${layout.player.id}-pile-${pileIndex}-bottom`);
                  const topShown =
                    !!pile.topCard && deal.isExtraRevealed(`${layout.player.id}-pile-${pileIndex}-top`);
                  const canSelectPile = isMyPile && !!playable && isCardSelectable(
                    playable.card,
                    playable.fromTop ? 'pile-top' : 'pile-bottom',
                    pileIndex,
                  );
                  const pileSelected = playable && selectedKeys.has(
                    cardKey(playable.card, playable.fromTop ? 'pile-top' : 'pile-bottom', pileIndex),
                  );

                  const pileTopAnimating = playAnim.animation?.phase === 'playFly'
                    && state.actionAnnouncement?.playerId === layout.player.id
                    && state.actionAnnouncement.plays.some(
                      p => p.source === 'pile-top' && p.pileIndex === pileIndex,
                    );
                  const pileBottomAnimating = playAnim.animation?.phase === 'playFly'
                    && state.actionAnnouncement?.playerId === layout.player.id
                    && state.actionAnnouncement.plays.some(
                      p => p.source === 'pile-bottom' && p.pileIndex === pileIndex,
                    );

                  return (
                    <button
                      key={`${layout.player.id}-pile-${pileIndex}`}
                      ref={el => setPileRef(`${layout.player.id}-${pileIndex}`, el)}
                      type="button"
                      onClick={() => {
                        if (!isMyPile || !playable) return;
                        toggleSelection(
                          playable.card,
                          playable.fromTop ? 'pile-top' : 'pile-bottom',
                          pileIndex,
                        );
                      }}
                      disabled={!isMyPile || !playable || (!canSelectPile && !pileSelected)}
                      className={`twelve-pileButton ${pileSelected ? 'tens-pileButton--selected' : ''} ${pileTopAnimating ? 'tens-pileButton--animatingTop' : ''} ${pileBottomAnimating ? 'tens-pileButton--animatingBottom' : ''}`}
                      aria-label={`Pile ${pileIndex + 1}`}
                    >
                      <div className="twelve-pileBottom">
                        {bottomShown ? (
                          <TensFlipCard card={pile.bottomCard!} faceDown disabled={!canSelectPile && !pileSelected} />
                        ) : (
                          <div className="twelve-pilePlaceholder" />
                        )}
                      </div>
                      {topShown && (
                        <div className={`twelve-pileTop ${bottomShown ? 'twelve-pileTop--stacked' : ''}`}>
                          <CardFace card={pile.topCard!} disabled={!canSelectPile && !pileSelected} compact />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div className={`radial-center tens-center ${isHandZoomed ? 'radial-center--zoom' : ''}`}>
          <div ref={centerRef} className="tens-centerStack">
            {visibleCenter.map((centerCard, i) => (
              <div
                key={`center-${centerCard.suit}-${centerCard.rank}-${i}`}
                className="tens-centerCard radial-slot radial-slot--filled"
                style={{
                  transform: `translate(calc(-50% + ${i * 5}px), calc(-50% + ${-i * 4}px))`,
                  zIndex: i + 1,
                }}
              >
                {renderCenterCardFace(centerCard)}
              </div>
            ))}
          </div>
          <div
            ref={discardRef}
            className="tens-discardBadge"
            aria-label={playAnim.displayDiscardCount > 0 ? `${playAnim.displayDiscardCount} cards cleared` : undefined}
            aria-hidden={playAnim.displayDiscardCount === 0}
          >
            {playAnim.displayDiscardCount > 0 && (
              <>
                <span className="card-back tens-discardBack" />
                <span className="tens-discardCount">{playAnim.displayDiscardCount}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="twelve-statusBlock">
        <div className="radial-headsUp" aria-live="polite">
          <p
            className={`radial-headsUpText ${state.phase === 'round-end' ? 'radial-headsUpText--roundEnd' : ''} ${hasActionButtons ? 'twelve-headsUpText--withAction' : ''}`}
          >
            {hasActionButtons ? (
              <span className="tens-headsUpInline">
                <span>{headsUpContent ?? '\u00a0'}</span>
                <button
                  type="button"
                  onClick={submitPlay}
                  disabled={!canSubmitPlay}
                  className="tens-playButton tens-playButton--inline"
                >
                  Play{selectedPlays.length > 0 ? ` (${selectedPlays.length})` : ''}
                </button>
              </span>
            ) : (
              headsUpContent ?? '\u00a0'
            )}
          </p>
        </div>
      </div>

      {myPlayer && (
        <div ref={handContainerRef} className={`radial-hand ${isHandZoomed ? 'radial-hand--zoom' : ''}`}>
          <div
            className={`radial-handSpread ${isThrowingCards ? 'card-toss-handSpread--hidden' : ''}`}
            style={{
              width: `${handLayout.spreadWidth}px`,
              height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
              transition: 'width 0.16s ease',
            }}
          >
            {visibleHand.map((cardFace, i) => {
              const key = handCardKey(i);
              const selected = selectedKeys.has(key);
              const selectable = isCardSelectable(cardFace, 'hand', undefined, i);
              const isLast = i === visibleHand.length - 1;
              const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

              return (
                <motion.button
                  key={key}
                  type="button"
                  initial={deal.isDealing ? { scale: 0.6, opacity: 0 } : reduceMotion ? false : { y: 50, opacity: 0 }}
                  animate={deal.isDealing ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }}
                  transition={deal.isDealing ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : { delay: i * 0.02 }}
                  onClick={() => toggleSelection(cardFace, 'hand', undefined, i)}
                  disabled={!canInteract || (!selectable && !selected)}
                  className="radial-handHitbox"
                  style={{
                    left: `${i * handLayout.step}px`,
                    width: `${hitboxWidth}px`,
                    height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                    zIndex: i + 1,
                  }}
                  aria-label={`${selected ? 'Deselect' : 'Select'} ${rankDisplay(cardFace.rank)} of ${cardFace.suit}`}
                >
                  <span
                    className={`radial-handCardWrap ${canInteract && (selectable || selected) ? (selected ? '' : 'radial-handCardWrap--active') : ''}`}
                    style={{
                      width: `${handLayout.cardWidth}px`,
                      height: `${handLayout.cardHeight}px`,
                      transform: selected ? `translateY(-${handLayout.selectedLift}px)` : 'translateY(0px)',
                    }}
                  >
                    <CardFace card={cardFace} disabled={!canInteract || (!selectable && !selected)} selected={selected} />
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
