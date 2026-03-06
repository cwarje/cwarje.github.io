import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, Suit, UpRiverPlayer, UpRiverState } from './types';
import { isValidUpRiverPlay } from './rules';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX } from '../../networking/playerColors';

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

interface UpRiverBoardProps {
  state: UpRiverState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
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

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

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
  const layout = TRICK_SLOT_PLACEMENTS[playerCount]?.[relativeIndex];
  if (layout) return layout;

  return {
    row: 2,
    col: 2,
    dx: '0px',
    dy: '0px',
  };
}

export default function UpAndDownTheRiverBoard({ state, myId, onAction, isHandZoomed = false }: UpRiverBoardProps) {
  const myIndex = state.players.findIndex(player => player.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = myIndex >= 0 && state.currentPlayerIndex === myIndex;
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLDivElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });

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

  const headsUpMessage = useMemo(() => {
    if (state.phase === 'round-end') {
      const madeBidNames = state.players
        .filter(player => player.bid !== null && player.bid === player.tricksWon)
        .map(player => (player.id === myId ? 'You' : player.name));
      const missedBidNames = state.players
        .filter(player => player.bid === null || player.bid !== player.tricksWon)
        .map(player => (player.id === myId ? 'You' : player.name));
      const madeBidText = madeBidNames.length > 0 ? madeBidNames.join(', ') : 'None';
      const missedBidText = missedBidNames.length > 0 ? missedBidNames.join(', ') : 'None';
      return `Made bid: ${madeBidText} · Missed bid: ${missedBidText}`;
    }

    if (state.phase === 'bidding') {
      if (isMyTurn) return 'Your turn to bid';
      return `Waiting for ${state.players[state.currentPlayerIndex]?.name ?? 'player'} to bid`;
    }
    if (state.phase === 'playing' && state.trickWinner) {
      const winnerName = state.players.find(player => player.id === state.trickWinner)?.name ?? 'Player';
      return `${winnerName} won the trick`;
    }
    if (state.phase === 'playing' && isMyTurn) return 'Your turn';
    return '';
  }, [state.phase, state.players, state.currentPlayerIndex, state.trickWinner, isMyTurn]);

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
    const cardCount = myPlayer?.hand.length ?? 0;
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
  }, [handWidth, myPlayer?.hand.length]);

  const renderCardFace = (card: Card, disabled = false, compact = false) => (
    <div className={`river-card ${disabled ? 'river-card--disabled' : ''} ${compact ? 'river-card--compact' : ''}`}>
      <div className="river-cardCorner">
        <span className={`river-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
        <span className={`river-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  const renderSeatPill = (seatLayout: RiverSeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === player.id && !state.trickWinner;
    const isMe = player.id === myId;
    const bidMatched = player.bid !== null && player.bid === player.tricksWon;
    const seatPillStateClass = state.phase === 'round-end'
      ? bidMatched
        ? 'river-seatPill--roundSuccess'
        : 'river-seatPill--roundFail'
      : isCurrentTurn
        ? isMe
          ? 'river-seatPill--activeSelf'
          : 'river-seatPill--activeOther'
        : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const bidText = player.bid === null ? '-' : String(player.bid);

    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`river-seatPill ${seatPillStateClass} ${isMe ? 'river-seatPill--me' : ''}`}
      >
        <div className="river-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <span className="river-seatName">{isMe ? 'You' : player.name}</span>
        </div>
        <div className="river-seatPillLabels">
          <span className="river-seatCell river-seatCell--bid">Bid</span>
          <span className="river-seatCell river-seatCell--tricks">Trx</span>
          <span className="river-seatCell river-seatCell--total">Tot</span>
        </div>
        <div className="river-seatPillValues">
          <span className="river-seatCell river-seatCell--bid">{bidText}</span>
          <span className="river-seatCell river-seatCell--tricks">{player.tricksWon}</span>
          <span className="river-seatCell river-seatCell--total">{player.totalScore}</span>
        </div>
      </div>
    );
  };

  const playCard = (card: Card) => {
    if (state.phase !== 'playing' || !isMyTurn || state.trickWinner || myIndex < 0) return;
    if (!isValidUpRiverPlay(state, myIndex, card)) return;
    onAction({ type: 'play-card', card });
  };

  const placeBid = (bid: number) => {
    if (state.phase !== 'bidding' || !isMyTurn) return;
    onAction({ type: 'place-bid', bid });
  };

  if (state.gameOver) {
    const rankedPlayers = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="river-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <div className="space-y-3 w-full max-w-2xl">
          {rankedPlayers.map((player, i) => (
            <div key={player.id} className="river-resultRow">
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
    <div className={`river-board river-board--players-${state.players.length} space-y-3 sm:space-y-4`}>
      <div ref={tableRef} className={`river-table river-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`river-seat ${layout.relativeIndex === 0 ? 'river-seat--self' : ''}`}
            style={{
              left: `${layout.seatLeft}%`,
              top: `${layout.seatTop}%`,
            }}
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
                        initial={{ scale: 0.8, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{
                          x: trickExitOffset.x,
                          y: trickExitOffset.y,
                          opacity: 0,
                        }}
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
        <p className={`river-headsUpText ${state.phase === 'round-end' ? 'river-headsUpText--roundEnd' : ''}`}>
          {headsUpMessage || '\u00a0'}
        </p>
      </div>

      {myPlayer && (
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
              {myPlayer.hand.map((card, i) => {
                const canPlay = state.phase === 'playing' && isMyTurn && !state.trickWinner && isValidUpRiverPlay(state, myIndex, card);
                const isDisabled = !canPlay;
                const isLast = i === myPlayer.hand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}`}
                    type="button"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => playCard(card)}
                    disabled={isDisabled}
                    className="river-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                    aria-label={`Play ${rankDisplay(card.rank)} of ${card.suit}`}
                  >
                    <span
                      className={`river-handCardWrap ${canPlay ? 'river-handCardWrap--active' : ''}`}
                      style={{
                        width: `${handLayout.cardWidth}px`,
                        height: `${handLayout.cardHeight}px`,
                      }}
                    >
                      {renderCardFace(card, state.phase === 'playing' && isDisabled)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div className="river-actionRow">
            {state.phase === 'bidding' ? (
              <div className="river-bidInline">
                <span className="river-bidInlineLabel">Bid:</span>
                <div className="river-bidInlineButtons">
                  {Array.from({ length: state.currentRoundCardCount + 1 }, (_, bid) => (
                    <button
                      key={bid}
                      type="button"
                      disabled={!isMyTurn}
                      onClick={() => placeBid(bid)}
                      className={`river-bidInlineButton ${myPlayer.bid === bid ? 'river-bidInlineButton--selected' : ''}`}
                    >
                      {bid}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="river-actionSpacer" aria-hidden="true">
                &nbsp;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
