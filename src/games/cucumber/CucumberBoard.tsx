import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, CucumberPlayer, CucumberState, Suit } from './types';
import { isValidCucumberPlay } from './rules';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import { useDealerDealAnimation, type DealSeat } from '../shared/useDealerDealAnimation';
import { DealAnimationLayer } from '../shared/DealAnimationLayer';

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<Suit, string> = {
  hearts: 'text-red-400',
  diamonds: 'text-red-400',
  clubs: 'text-gray-800',
  spades: 'text-gray-800',
};

interface CucumberBoardProps {
  state: CucumberState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
}

interface SeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: CucumberPlayer;
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

const SEAT_EDGE_GAP_PX = 8;
const TRICK_EXIT_DISTANCE_PX = 72;

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount >= 6) return { seatRadiusX: 40, seatRadiusY: 34 };
  if (playerCount === 5) return { seatRadiusX: 37, seatRadiusY: 32 };
  return { seatRadiusX: 35, seatRadiusY: 30 };
}

const TRICK_SLOT_PLACEMENTS: Record<number, TrickSlotPlacement[]> = {
  3: [
    { row: 2, col: 2, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 3, dx: '0px', dy: '0px' },
  ],
  4: [
    { row: 2, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 1, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.5)' },
    { row: 1, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.5)' },
  ],
  5: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * 0.25)' },
    { row: 2, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: 'calc(var(--river-slot-w) * 0.5)', dy: '0px' },
    { row: 1, col: 3, dx: 'calc(var(--river-slot-w) * -0.5)', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: '0px' },
  ],
  6: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * 0.25)' },
    { row: 2, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.25)' },
    { row: 1, col: 3, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: '0px' },
  ],
};

function getTrickSlotPlacement(playerCount: number, relativeIndex: number): TrickSlotPlacement {
  return TRICK_SLOT_PLACEMENTS[playerCount]?.[relativeIndex] ?? {
    row: 2,
    col: 2,
    dx: '0px',
    dy: '0px',
  };
}

export default function CucumberBoard({ state, myId, onAction, isHandZoomed = false }: CucumberBoardProps) {
  const myIndex = state.players.findIndex(player => player.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const currentPlayerId = state.handPlayerIds[state.currentPlayerIndex] ?? null;
  const isMyTurn = myPlayer !== null && currentPlayerId === myId && state.phase === 'playing';
  const boardRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLDivElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });

  const aceInTrick = state.currentTrick.some(entry => entry.card.rank === 14);

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
        count: layout.player.eliminated ? 0 : layout.player.hand.length,
      })),
    [seatLayouts],
  );

  const deal = useDealerDealAnimation({
    boardRef,
    tableRef,
    dealKey: String(state.handNumber),
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

  const headsUpContent = useMemo((): ReactNode => {
    if (state.phase === 'hand-end' && state.lastHandPenalty) {
      const penalized = state.players.find(p => p.id === state.lastHandPenalty?.playerId);
      if (!penalized) return 'Hand complete';
      const name = penalized.id === myId ? 'You' : penalized.name;
      return (
        <>
          <span style={{ color: getPlayerHudTextColor(penalized.color) }}>{name}</span>
          {` took the last trick (+${state.lastHandPenalty.points} pts)`}
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

    if (state.phase === 'playing' && aceInTrick) {
      return 'Ace played — play your lowest card';
    }

    if (state.phase === 'playing' && isMyTurn) {
      return `Your turn · Trick ${state.trickNumber} of 7`;
    }

    if (state.phase === 'playing' && currentPlayerId) {
      const waiting = state.players.find(p => p.id === currentPlayerId);
      if (!waiting) return null;
      return (
        <>
          {'Waiting for '}
          <span style={{ color: getPlayerHudTextColor(waiting.color) }}>{waiting.name}</span>
          {` · Trick ${state.trickNumber} of 7`}
        </>
      );
    }

    return null;
  }, [state, isMyTurn, myId, aceInTrick, currentPlayerId]);

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

    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [handWidth, visibleHand.length]);

  const renderCardFace = (cardFace: Card, disabled = false, compact = false) => (
    <div className={`river-card ${disabled ? 'river-card--disabled' : ''} ${compact ? 'river-card--compact' : ''}`}>
      <div className="river-cardCorner">
        <span className={`river-cardRank ${SUIT_COLORS[cardFace.suit]}`}>{rankDisplay(cardFace.rank)}</span>
        <span className={`river-cardSuit ${SUIT_COLORS[cardFace.suit]}`}>{SUIT_SYMBOLS[cardFace.suit]}</span>
      </div>
    </div>
  );

  const renderSeatPill = (seatLayout: SeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn = currentPlayerId === player.id && !state.trickWinner && state.phase === 'playing';
    const isMe = player.id === myId;
    const seatPillStateClass = player.eliminated
      ? 'cucumber-seatPill--eliminated'
      : isCurrentTurn
        ? isMe
          ? 'river-seatPill--activeSelf'
          : 'river-seatPill--activeOther'
        : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const dangerClass = player.penaltyScore >= state.eliminationThreshold - 7 ? 'cucumber-seatScore--danger' : '';

    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`river-seatPill cucumber-seatPill ${seatPillStateClass} ${isMe ? 'river-seatPill--me' : ''}`}
      >
        <div className="river-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <span className="river-seatName">{isMe ? 'You' : player.name}</span>
        </div>
        <div className={`cucumber-seatScoreRow ${dangerClass}`}>
          {player.penaltyScore}/{state.eliminationThreshold}
        </div>
        {player.eliminated && <span className="cucumber-eliminatedTag">Out</span>}
      </div>
    );
  };

  const playCard = (cardFace: Card) => {
    if (state.phase !== 'playing' || !isMyTurn || state.trickWinner || deal.isDealing) return;
    if (!isValidCucumberPlay(state, myId, cardFace)) return;
    onAction({ type: 'play-card', card: cardFace });
  };

  if (state.gameOver) {
    const winner = state.players.find(p => state.winners.includes(p.id));
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="cucumber-board river-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        {winner && (
          <p className="text-xl text-white/90">
            {winner.id === myId ? 'You win!' : `${winner.name} wins!`}
          </p>
        )}
        <div className="space-y-3 w-full max-w-2xl">
          {[...state.players]
            .sort((a, b) => a.penaltyScore - b.penaltyScore)
            .map((player, i) => (
              <div key={player.id} className="river-resultRow">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">#{i + 1}</span>
                  <span className={`font-semibold ${player.eliminated ? 'line-through opacity-60' : ''}`}>
                    {player.name}
                  </span>
                </div>
                <span className="text-xl font-bold">{player.penaltyScore} pts</span>
              </div>
            ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div ref={boardRef} className={`cucumber-board river-board river-board--players-${state.players.length} relative space-y-3 sm:space-y-4`}>
      <DealAnimationLayer flights={deal.flights} dealCenter={deal.dealCenter} remaining={deal.flights.length} />
      <div ref={tableRef} className={`river-table river-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`river-seat ${layout.relativeIndex === 0 ? 'river-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            {renderSeatPill(layout, layout.relativeIndex === 0)}
          </div>
        ))}

        <div className={`river-center ${isHandZoomed ? 'river-center--zoom' : ''}`}>
          <div className="river-centerGrid">
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
                  className={`river-slot ${trickEntry ? 'river-slot--filled' : 'river-slot--empty'}`}
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
                        exit={{ x: trickExitOffset.x, y: trickExitOffset.y, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className={`river-slotCard ${isWinningCard ? 'river-slotCard--winner' : ''}`}
                      >
                        <div className="river-slotCardInner">
                          {renderCardFace(trickEntry.card, false, true)}
                        </div>
                      </motion.div>
                    ) : (
                      <div key={`placeholder-${layout.relativeIndex}`} className="river-slotPlaceholder" />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="river-headsUp" aria-live="polite">
        <p className={`river-headsUpText ${state.phase === 'hand-end' ? 'cucumber-headsUpText--handEnd' : ''}`}>
          {headsUpContent ?? '\u00a0'}
        </p>
      </div>

      {myPlayer && !myPlayer.eliminated && (
        <div className="space-y-3">
          <div ref={handContainerRef} className={`river-hand ${isHandZoomed ? 'river-hand--zoom' : ''}`}>
            <div
              className="river-handSpread"
              style={{
                width: `${handLayout.spreadWidth}px`,
                height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                transition: 'width 0.16s ease',
              }}
            >
              {visibleHand.map((cardFace, i) => {
                const canPlay =
                  state.phase === 'playing' &&
                  isMyTurn &&
                  !state.trickWinner &&
                  !deal.isDealing &&
                  isValidCucumberPlay(state, myId, cardFace);
                const isDisabled = !canPlay;
                const isLast = i === visibleHand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

                return (
                  <motion.button
                    key={`${cardFace.suit}-${cardFace.rank}`}
                    type="button"
                    initial={deal.isDealing ? { scale: 0.6, opacity: 0 } : { y: 50, opacity: 0 }}
                    animate={deal.isDealing ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }}
                    transition={deal.isDealing ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : { delay: i * 0.02 }}
                    onClick={() => playCard(cardFace)}
                    disabled={isDisabled}
                    className="river-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                    aria-label={`Play ${rankDisplay(cardFace.rank)} of ${cardFace.suit}`}
                  >
                    <span
                      className={`river-handCardWrap ${canPlay ? 'river-handCardWrap--active' : ''}`}
                      style={{ width: `${handLayout.cardWidth}px`, height: `${handLayout.cardHeight}px` }}
                    >
                      {renderCardFace(cardFace, state.phase === 'playing' && isDisabled)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div className="river-actionRow">
            <div className="river-actionSpacer" aria-hidden="true">&nbsp;</div>
          </div>
        </div>
      )}
    </div>
  );
}
