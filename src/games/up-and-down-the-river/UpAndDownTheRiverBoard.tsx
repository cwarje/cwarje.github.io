import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TableEvent, TableEventInput } from '../../networking/types';
import type { Card, UpRiverPlayer, UpRiverState } from './types';
import { isValidUpRiverPlay } from './rules';
import { getForbiddenPerfectBid } from './logic';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import { useDealerDealAnimation, type DealSeat } from '../shared/useDealerDealAnimation';
import { DealAnimationLayer } from '../shared/DealAnimationLayer';
import { CardTossLayers } from '../shared/CardTossLayers';
import { useCardToss } from '../shared/useCardToss';
import { CardFace } from '../shared/ui/CardFace';
import { RadialSeatName } from '../shared/ui/RadialSeatName';
import { rankDisplay } from '../shared/ui/cardConstants';

interface UpRiverBoardProps {
  state: UpRiverState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
  sendTableEvent?: (event: TableEventInput) => void;
  lastTableEvent?: TableEvent | null;
}

interface RiverSeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: UpRiverPlayer;
  seatLeft: number;
  seatTop: number;
}

interface TrickSlotPlacement {
  row: 1 | 2;
  col: 1 | 2 | 3;
  dx: string;
  dy: string;
}

interface ElementSize {
  width: number;
  height: number;
}

const RIVER_SEAT_EDGE_GAP_PX = 8;
const TRICK_EXIT_DISTANCE_PX = 72;

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount >= 6) {
    return {
      seatRadiusX: 40,
      seatRadiusY: 34,
    };
  }

  if (playerCount === 5) {
    return {
      seatRadiusX: 37,
      seatRadiusY: 32,
    };
  }

  return {
    seatRadiusX: 35,
    seatRadiusY: 30,
  };
}

const TRICK_SLOT_PLACEMENTS: Record<number, TrickSlotPlacement[]> = {
  4: [
    { row: 2, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 1, dx: '0px', dy: 'calc(var(--radial-slot-h) * -0.5)' },
    { row: 1, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: 'calc(var(--radial-slot-h) * -0.5)' },
  ],
  5: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--radial-slot-h) * 0.25)' },
    { row: 2, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: 'calc(var(--radial-slot-w) * 0.5)', dy: '0px' },
    { row: 1, col: 3, dx: 'calc(var(--radial-slot-w) * -0.5)', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: '0px' },
  ],
  6: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--radial-slot-h) * 0.25)' },
    { row: 2, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 2, dx: '0px', dy: 'calc(var(--radial-slot-h) * -0.25)' },
    { row: 1, col: 3, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: '0px' },
  ],
};

const BID_REVEAL_SEAT_BLEND = 0.68;

function getBidRevealPosition(seatLeft: number, seatTop: number): { left: number; top: number } {
  return {
    left: 50 + (seatLeft - 50) * BID_REVEAL_SEAT_BLEND,
    top: 50 + (seatTop - 50) * BID_REVEAL_SEAT_BLEND,
  };
}

function getTrickSlotPlacement(playerCount: number, relativeIndex: number): TrickSlotPlacement {
  const layout = TRICK_SLOT_PLACEMENTS[playerCount]?.[relativeIndex];
  if (layout) return layout;

  return {
    row: 2,
    col: 2,
    dx: '0px',
    dy: '0px',
  };
}

export default function UpAndDownTheRiverBoard({
  state,
  myId,
  onAction,
  isHandZoomed = false,
  sendTableEvent,
  lastTableEvent,
}: UpRiverBoardProps) {
  const myIndex = state.players.findIndex(player => player.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = myIndex >= 0 && state.currentPlayerIndex === myIndex;
  const isKnocking = state.upRiverBiddingStyle === 'knocking';
  const mySubmittedBid = state.submittedBids[myId];
  const hasSubmittedKnockingBid = mySubmittedBid !== undefined;
  const canPlaceKnockingBid = isKnocking && state.phase === 'bidding' && !hasSubmittedKnockingBid;
  const canPlaceSequentialBid = !isKnocking && state.phase === 'bidding' && isMyTurn;
  const canPlaceBid = canPlaceKnockingBid || canPlaceSequentialBid;
  const boardRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLButtonElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });

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
    gameType: 'up-and-down-the-river',
    sendTableEvent,
    lastTableEvent,
  });

  const seatLayouts = useMemo<RiverSeatLayout[]>(() => {
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
          const usableHalfWidth = tableSize.width / 2 - seatPillSize.width / 2 - RIVER_SEAT_EDGE_GAP_PX;
          const usableHalfHeight = tableSize.height / 2 - seatPillSize.height / 2 - RIVER_SEAT_EDGE_GAP_PX;
          return {
            seatRadiusX: Math.max(0, Math.min(50, (usableHalfWidth / tableSize.width) * 100)),
            seatRadiusY: Math.max(0, Math.min(50, (usableHalfHeight / tableSize.height) * 100)),
          };
        })()
      : fallbackRadii;

    return Array.from({ length: playerCount }, (_, relativeIndex) => {
      const playerIndex = (anchorIndex + relativeIndex) % playerCount;
      const player = state.players[playerIndex];
      const angle = 90 + (360 * relativeIndex) / playerCount;
      const angleInRadians = (angle * Math.PI) / 180;
      return {
        relativeIndex,
        playerIndex,
        player,
        seatLeft: 50 + radii.seatRadiusX * Math.cos(angleInRadians),
        seatTop: 50 + radii.seatRadiusY * Math.sin(angleInRadians),
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

  const deal = useDealerDealAnimation({
    boardRef,
    tableRef,
    dealKey: String(state.roundIndex),
    seats: dealSeats,
  });

  const myRevealCount = deal.revealedFor(myId, myPlayer?.hand.length ?? 0);
  const visibleHand = myPlayer ? myPlayer.hand.slice(0, myRevealCount) : [];

  const trickByRelativeSeat = useMemo(() => {
    const mapped: Partial<Record<number, { playerId: string; card: Card }>> = {};
    const playerCount = state.players.length;
    state.currentTrick.forEach((entry) => {
      const index = state.players.findIndex(p => p.id === entry.playerId);
      if (index === -1) return;
      const relative = (index - anchorIndex + playerCount) % playerCount;
      mapped[relative] = entry;
    });
    return mapped;
  }, [state.currentTrick, state.players, anchorIndex]);

  const trickWinnerRelativeSeat = useMemo(() => {
    if (!state.trickWinner) return null;
    const winnerIndex = state.players.findIndex(player => player.id === state.trickWinner);
    if (winnerIndex === -1) return null;
    return (winnerIndex - anchorIndex + state.players.length) % state.players.length;
  }, [state.players, state.trickWinner, anchorIndex]);

  const trickExitOffset = useMemo(() => {
    if (trickWinnerRelativeSeat === null) return { x: 0, y: 20 };
    const winnerLayout = seatLayouts.find(layout => layout.relativeIndex === trickWinnerRelativeSeat);
    if (!winnerLayout) return { x: 0, y: 20 };

    const deltaX = winnerLayout.seatLeft - 50;
    const deltaY = winnerLayout.seatTop - 50;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance < 0.001) return { x: 0, y: 20 };

    return {
      x: (deltaX / distance) * TRICK_EXIT_DISTANCE_PX,
      y: (deltaY / distance) * TRICK_EXIT_DISTANCE_PX,
    };
  }, [trickWinnerRelativeSeat, seatLayouts]);

  const roundEndAriaLabel = useMemo(() => {
    if (state.phase !== 'round-end') return undefined;
    const madeBidNames = state.players
      .filter(player => player.bid !== null && player.bid === player.tricksWon)
      .map(player => (player.id === myId ? 'You' : player.name));
    const missedBidNames = state.players
      .filter(player => player.bid === null || player.bid !== player.tricksWon)
      .map(player => (player.id === myId ? 'You' : player.name));
    const madeBidText = madeBidNames.length > 0 ? madeBidNames.join(', ') : 'None';
    const missedBidText = missedBidNames.length > 0 ? missedBidNames.join(', ') : 'None';
    return `Made bid: ${madeBidText} · Missed bid: ${missedBidText}`;
  }, [state.phase, state.players, myId]);

  const headsUpContent = useMemo((): ReactNode => {
    if (state.phase === 'round-end') {
      const madeBidPlayers = state.players.filter(
        player => player.bid !== null && player.bid === player.tricksWon,
      );
      const missedBidPlayers = state.players.filter(
        player => player.bid === null || player.bid !== player.tricksWon,
      );
      return (
        <>
          {'Made bid: '}
          {madeBidPlayers.length > 0 ? (
            madeBidPlayers.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                {p.id === myId ? 'You' : <span style={{ color: getPlayerHudTextColor(p.color) }}>{p.name}</span>}
              </span>
            ))
          ) : (
            'None'
          )}
          {' · Missed bid: '}
          {missedBidPlayers.length > 0 ? (
            missedBidPlayers.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                {p.id === myId ? 'You' : <span style={{ color: getPlayerHudTextColor(p.color) }}>{p.name}</span>}
              </span>
            ))
          ) : (
            'None'
          )}
        </>
      );
    }

    if (state.phase === 'bid-countdown') {
      return 'Revealing bids...';
    }

    if (state.phase === 'bid-reveal') {
      return null;
    }

    if (state.phase === 'bidding') {
      if (isKnocking) {
        if (!hasSubmittedKnockingBid) return 'Select your bid';
        const waitingOn = state.players.filter(
          player => !player.isBot && state.submittedBids[player.id] === undefined,
        );
        if (waitingOn.length > 0) {
          return (
            <>
              {'Waiting on '}
              {waitingOn.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <span style={{ color: getPlayerHudTextColor(p.color) }}>
                    {p.id === myId ? 'You' : p.name}
                  </span>
                </span>
              ))}
              {' to bid'}
            </>
          );
        }
        return 'Revealing bids...';
      }

      if (isMyTurn) return 'Your turn to bid';
      const waitingPlayer = state.players[state.currentPlayerIndex];
      if (!waitingPlayer) return null;
      return (
        <>
          {'Waiting for '}
          <span style={{ color: getPlayerHudTextColor(waitingPlayer.color) }}>{waitingPlayer.name}</span>
          {' to bid'}
        </>
      );
    }
    if (state.phase === 'playing' && state.trickWinner) {
      const winner = state.players.find(player => player.id === state.trickWinner);
      if (!winner) return null;
      return (
        <>
          <span style={{ color: getPlayerHudTextColor(winner.color) }}>{winner.name}</span>
          {' won the trick'}
        </>
      );
    }
    if (state.phase === 'playing' && isMyTurn) return 'Your turn';
    return null;
  }, [
    state.phase,
    state.players,
    state.currentPlayerIndex,
    state.trickWinner,
    state.upRiverBiddingStyle,
    state.submittedBids,
    isMyTurn,
    isKnocking,
    hasSubmittedKnockingBid,
    myId,
  ]);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;

    const updateSize = () => setTableSize({ width: element.clientWidth, height: element.clientHeight });
    updateSize();

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!seatPillElement) return;

    const updateSize = () => {
      setSeatPillSize({ width: seatPillElement.clientWidth, height: seatPillElement.clientHeight });
    };
    updateSize();

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(seatPillElement);
    return () => resizeObserver.disconnect();
  }, [seatPillElement]);

  useEffect(() => {
    const element = handContainerRef.current;
    if (!element) return;

    const updateSize = () => setHandWidth(element.clientWidth);
    updateSize();

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const handLayout = useMemo(() => {
    const cardCount = visibleHand.length;
    const available = Math.max(handWidth - 8, 220);
    const cardWidth = Math.max(58, Math.min(available * 0.2, available < 420 ? 72 : 84));
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
      selectedLift: 14,
    };
  }, [handWidth, visibleHand.length]);

  const renderSeatPill = (seatLayout: RiverSeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn =
      state.phase === 'playing' &&
      state.players[state.currentPlayerIndex]?.id === player.id &&
      !state.trickWinner;
    const isSequentialBidTurn =
      !isKnocking &&
      state.phase === 'bidding' &&
      state.players[state.currentPlayerIndex]?.id === player.id;
    const needsKnockingBid =
      isKnocking && state.phase === 'bidding' && state.submittedBids[player.id] === undefined;
    const isActiveTurn = isCurrentTurn || isSequentialBidTurn;
    const isMe = player.id === myId;
    const bidMatched = player.bid !== null && player.bid === player.tricksWon;
    const seatPillStateClass = state.phase === 'round-end'
      ? bidMatched
        ? 'radial-seatPill--roundSuccess'
        : 'radial-seatPill--roundFail'
      : needsKnockingBid
        ? isMe
          ? 'radial-seatPill--activeSelf'
          : ''
        : isActiveTurn
          ? isMe
            ? 'radial-seatPill--activeSelf'
            : 'radial-seatPill--activeOther'
          : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const showBidOnPill =
      isKnocking || (state.phase !== 'bidding' && state.phase !== 'bid-reveal');
    const bidText = !showBidOnPill || player.bid === null ? '-' : String(player.bid);
    const tossProps = getSeatPillTossProps({
      playerId: player.id,
      playerName: player.name,
      isMe,
      selfAriaLabel: 'Your seat',
      seatLeft: seatLayout.seatLeft,
      seatTop: seatLayout.seatTop,
    });

    return (
      <button
        type="button"
        ref={shouldMeasure ? setSeatPillElement : undefined}
        onClick={tossProps.onClick}
        disabled={tossProps.disabled}
        className={`radial-seatPill card-toss-seatPillButton ${seatPillStateClass} ${isMe ? 'radial-seatPill--me' : ''}`}
        aria-label={tossProps['aria-label']}
      >
        <div className="radial-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <RadialSeatName name={isMe ? 'You' : player.name} textColor={seatTextColor} />
        </div>
        <div className="radial-seatPillLabels">
          <span className="radial-seatCell radial-seatCell--bid">Bid</span>
          <span className="radial-seatCell radial-seatCell--tricks">Trx</span>
          <span className="radial-seatCell radial-seatCell--total">Tot</span>
        </div>
        <div className="radial-seatPillValues">
          <span className="radial-seatCell radial-seatCell--bid">{bidText}</span>
          <span className="radial-seatCell radial-seatCell--tricks">{player.tricksWon}</span>
          <span className="radial-seatCell radial-seatCell--total">{player.totalScore}</span>
        </div>
      </button>
    );
  };

  const playCard = (card: Card) => {
    if (state.phase !== 'playing' || !isMyTurn || state.trickWinner || myIndex < 0) return;
    if (!isValidUpRiverPlay(state, myIndex, card)) return;
    onAction({ type: 'play-card', card });
  };

  const placeBid = (bid: number) => {
    if (state.phase !== 'bidding' || !canPlaceBid) return;
    onAction({ type: 'place-bid', bid });
  };

  const forbiddenBid =
    state.phase === 'bidding' && !isKnocking ? getForbiddenPerfectBid(state) : null;
  const selectedBid = isKnocking ? mySubmittedBid : myPlayer?.bid ?? null;

  if (state.gameOver) {
    const rankedPlayers = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="radial-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <div className="space-y-3 w-full max-w-2xl">
          {rankedPlayers.map((player, i) => (
            <div key={player.id} className="radial-resultRow">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">#{i + 1}</span>
                <span className="font-semibold">{player.name}</span>
              </div>
              <span className="text-xl font-bold">{player.totalScore} pts</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div ref={boardRef} className={`radial-board radial-board--players-${state.players.length} relative space-y-3 sm:space-y-4`}>
      <DealAnimationLayer flights={deal.flights} dealCenter={deal.dealCenter} remaining={deal.flights.length} />
      <CardTossLayers
        cardTossBursts={cardTossBursts}
        seatCardSplats={seatCardSplats}
        cardSplats={cardSplats}
      />
      <div ref={tableRef} className={`radial-table radial-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`radial-seat ${layout.relativeIndex === 0 ? 'radial-seat--self' : ''}`}
            style={{
              left: `${layout.seatLeft}%`,
              top: `${layout.seatTop}%`,
            }}
          >
            {renderSeatPill(layout, layout.relativeIndex === 0)}
          </div>
        ))}

        <div className={`radial-center ${isHandZoomed ? 'radial-center--zoom' : ''}`}>
          <div className="radial-centerGrid">
            {seatLayouts.map((layout) => {
              const trickEntry = trickByRelativeSeat[layout.relativeIndex];
              const isWinningCard = trickWinnerRelativeSeat === layout.relativeIndex && !!state.trickWinner;
              const placement = getTrickSlotPlacement(state.players.length, layout.relativeIndex);
              const trickEntryOffset = (() => {
                const deltaX = layout.seatLeft - 50;
                const deltaY = layout.seatTop - 50;
                const distance = Math.hypot(deltaX, deltaY);
                if (distance < 0.001) return { x: 0, y: 12 };
                return {
                  x: (deltaX / distance) * TRICK_EXIT_DISTANCE_PX,
                  y: (deltaY / distance) * TRICK_EXIT_DISTANCE_PX,
                };
              })();
              return (
                <div
                  key={`slot-${layout.player.id}`}
                  className={`radial-slot ${trickEntry ? 'radial-slot--filled' : 'radial-slot--empty'}`}
                  style={{
                    gridColumn: placement.col,
                    gridRow: placement.row,
                    transform: `translate(${placement.dx}, ${placement.dy})`,
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {trickEntry ? (
                      <motion.div
                        key={`${state.trickNumber}-${trickEntry.playerId}-${trickEntry.card.suit}-${trickEntry.card.rank}`}
                        initial={{ scale: 0.8, opacity: 0, x: trickEntryOffset.x, y: trickEntryOffset.y }}
                        animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
                        exit={{
                          x: trickExitOffset.x,
                          y: trickExitOffset.y,
                          opacity: 0,
                        }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className={`radial-slotCard ${isWinningCard ? 'radial-slotCard--winner' : ''}`}
                      >
                        <div className="radial-slotCardInner">
                          <CardFace card={trickEntry.card} compact />
                        </div>
                      </motion.div>
                    ) : (
                      <div key={`placeholder-${layout.relativeIndex}`} className="radial-slotPlaceholder" />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {!isKnocking && (state.phase === 'bidding' || state.phase === 'bid-reveal') && (
          <div className="upriver-bidRevealLayer" aria-live="polite">
            {seatLayouts.map((layout) => {
              const bid = layout.player.bid;
              if (bid === null) return null;
              const revealPosition = getBidRevealPosition(layout.seatLeft, layout.seatTop);
              return (
                <div
                  key={`seq-bid-${layout.player.id}`}
                  className="upriver-bidRevealAnchor"
                  style={{
                    left: `${revealPosition.left}%`,
                    top: `${revealPosition.top}%`,
                  }}
                >
                  <motion.span
                    className="upriver-bidRevealNumber"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {bid}
                  </motion.span>
                </div>
              );
            })}
          </div>
        )}

        {state.phase === 'bid-countdown' && state.bidCountdown > 0 && (
          <div className="upriver-bidCountdown" aria-live="polite">
            <div className="upriver-bidCountdownAnchor">
              <motion.span
                key={state.bidCountdown}
                initial={{ scale: 0.6, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="upriver-bidCountdownNumber"
              >
                {state.bidCountdown}
              </motion.span>
            </div>
          </div>
        )}

        {state.phase === 'bid-reveal' && isKnocking && (
          <div className="upriver-bidRevealLayer" aria-live="polite">
            {seatLayouts.map((layout) => {
              const bid = state.submittedBids[layout.player.id];
              if (bid === undefined) return null;
              const revealPosition = getBidRevealPosition(layout.seatLeft, layout.seatTop);
              return (
                <div
                  key={`bid-reveal-${layout.player.id}`}
                  className="upriver-bidRevealAnchor"
                  style={{
                    left: `${revealPosition.left}%`,
                    top: `${revealPosition.top}%`,
                  }}
                >
                  <motion.span
                    className="upriver-bidRevealNumber"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 1] }}
                    transition={{ duration: 7, times: [0, 0.08, 6 / 7, 1], ease: 'linear' }}
                  >
                    {bid}
                  </motion.span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="radial-headsUp" aria-live="polite">
        <p
          className={`radial-headsUpText ${state.phase === 'round-end' ? 'radial-headsUpText--roundEnd' : ''}`}
          aria-label={roundEndAriaLabel}
        >
          {headsUpContent ?? '\u00a0'}
        </p>
      </div>

      {myPlayer && (
        <div className="space-y-3">
          <div ref={handContainerRef} className={`radial-hand ${isHandZoomed ? 'radial-hand--zoom' : ''}`}>
            <div
              className={`radial-handSpread ${isThrowingCards ? 'card-toss-handSpread--hidden' : ''}`}
              style={{
                width: `${handLayout.spreadWidth}px`,
                height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                transition: 'width 0.16s ease',
              }}
            >
              {visibleHand.map((card, i) => {
                const canPlay = state.phase === 'playing' && isMyTurn && !state.trickWinner && isValidUpRiverPlay(state, myIndex, card);
                const isDisabled = !canPlay;
                const isLast = i === visibleHand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}`}
                    type="button"
                    initial={deal.isDealing ? { scale: 0.6, opacity: 0 } : { y: 50, opacity: 0 }}
                    animate={deal.isDealing ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }}
                    transition={deal.isDealing ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : { delay: i * 0.02 }}
                    onClick={() => playCard(card)}
                    disabled={isDisabled}
                    className="radial-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                    aria-label={`Play ${rankDisplay(card.rank)} of ${card.suit}`}
                  >
                    <span
                      className={`radial-handCardWrap ${canPlay ? 'radial-handCardWrap--active' : ''}`}
                      style={{
                        width: `${handLayout.cardWidth}px`,
                        height: `${handLayout.cardHeight}px`,
                      }}
                    >
                      <CardFace card={card} disabled={state.phase === 'playing' && isDisabled} />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div className="radial-actionRow">
            {state.phase === 'bidding' && canPlaceBid ? (
              <div className="upriver-bidInline">
                <span className="upriver-bidInlineLabel">Bid:</span>
                <div className="upriver-bidInlineButtons">
                  {Array.from({ length: state.currentRoundCardCount + 1 }, (_, bid) => (
                    <button
                      key={bid}
                      type="button"
                      disabled={deal.isDealing || bid === forbiddenBid}
                      onClick={() => placeBid(bid)}
                      className={`upriver-bidInlineButton ${selectedBid === bid ? 'upriver-bidInlineButton--selected' : ''}`}
                    >
                      {bid}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="radial-actionSpacer" aria-hidden="true">
                &nbsp;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
