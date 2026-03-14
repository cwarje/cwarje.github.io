import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, Suit, TwelvePlayer, TwelveState } from './types';
import { getPilePlayableCard, isLegalPlay, rankDisplay, suitsWithRoyalPair } from './rules';
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

interface TwelveBoardProps {
  state: TwelveState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
}

interface SeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: TwelvePlayer;
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

const TRICK_SLOT_PLACEMENTS: Record<number, TrickSlotPlacement[]> = {
  2: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * 0.2)' },
    { row: 1, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.2)' },
  ],
  3: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--river-slot-h) * 0.2)' },
    { row: 1, col: 1, dx: 'calc(var(--river-slot-w) * 0.45)', dy: '0px' },
    { row: 1, col: 3, dx: 'calc(var(--river-slot-w) * -0.45)', dy: '0px' },
  ],
  4: [
    { row: 2, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 1, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.5)' },
    { row: 1, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: 'calc(var(--river-slot-h) * -0.5)' },
  ],
};

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount === 2) return { seatRadiusX: 30, seatRadiusY: 34 };
  if (playerCount === 4) return { seatRadiusX: 35, seatRadiusY: 31 };
  return { seatRadiusX: 34, seatRadiusY: 30 };
}

function getTrickSlotPlacement(playerCount: number, relativeIndex: number): TrickSlotPlacement {
  const layout = TRICK_SLOT_PLACEMENTS[playerCount]?.[relativeIndex];
  if (layout) return layout;
  return { row: 2, col: 2, dx: '0px', dy: '0px' };
}

function PokerFlipCard({ card, faceDown }: { card?: Card | null; faceDown: boolean }) {
  if (faceDown || !card) {
    return <div className="poker-card poker-cardBack poker-cardFlip--sm" />;
  }

  return (
    <div className="poker-cardFlip poker-cardFlip--sm">
      <motion.div
        className="poker-cardFlipInner"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.42, ease: 'easeInOut' }}
      >
        <div className="poker-cardFlipBack" aria-hidden="true" />
        <div className="poker-cardFlipFront">
          <div className="poker-cardCorner">
            <span className={`poker-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
            <span className={`poker-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function TwelveBoard({ state, myId, onAction, isHandZoomed = false }: TwelveBoardProps) {
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
      const index = state.players.findIndex(player => player.id === entry.playerId);
      if (index === -1) return;
      const relative = (index - anchorIndex + playerCount) % playerCount;
      mapped[relative] = { playerId: entry.playerId, card: entry.card };
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
      return state.roundSummary || 'Round over';
    }
    if (state.phase === 'flipping') return 'Flipping exposed cards...';
    if (state.trickWinner) {
      const winnerName = state.players.find(player => player.id === state.trickWinner)?.name ?? 'Player';
      return `${winnerName} won the trick`;
    }
    if (isMyTurn) return 'Your turn';
    return `Waiting for ${state.players[state.currentPlayerIndex]?.name ?? 'player'}`;
  }, [state.phase, state.roundSummary, state.trickWinner, state.players, state.currentPlayerIndex, isMyTurn]);

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
    const updateSize = () => setSeatPillSize({ width: seatPillElement.clientWidth, height: seatPillElement.clientHeight });
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
    return { cardWidth, cardHeight, step, spreadWidth, selectedLift: 14 };
  }, [handWidth, myPlayer?.hand.length]);

  const myRoyalSuits = myPlayer ? suitsWithRoyalPair(myPlayer) : [];
  const myShogSuits = myPlayer
    ? myRoyalSuits.filter(suit => !myPlayer.shogSuitsCalled.includes(suit))
    : [];
  const canUseActionButtons = state.phase === 'playing' && isMyTurn && !state.trickWinner;
  const canSetTrump = !!myPlayer && canUseActionButtons && state.trumpSuit === null && myPlayer.totalScore < 10;
  const canCallShog = !!myPlayer && canUseActionButtons && state.trumpSuit !== null && myPlayer.totalScore < 11;

  const renderCardFace = (card: Card, disabled = false, compact = false) => (
    <div className={`river-card ${disabled ? 'river-card--disabled' : ''} ${compact ? 'river-card--compact' : ''}`}>
      <div className="river-cardCorner">
        <span className={`river-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
        <span className={`river-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  const playHandCard = (card: Card) => {
    if (!canUseActionButtons || myIndex < 0) return;
    if (!isLegalPlay(state, myIndex, card, 'hand')) return;
    onAction({ type: 'play-hand-card', card });
  };

  const playPileCard = (pileIndex: number) => {
    if (!canUseActionButtons || myIndex < 0) return;
    const pile = myPlayer?.frontPiles[pileIndex];
    if (!pile) return;
    const playable = getPilePlayableCard(pile);
    if (!playable) return;
    if (!isLegalPlay(state, myIndex, playable.card, 'pile', pileIndex)) return;
    onAction({ type: 'play-pile-card', pileIndex });
  };

  const setTrump = (suit: Suit) => {
    if (!canSetTrump) return;
    onAction({ type: 'set-trump', suit });
  };

  const callShog = (suit: Suit) => {
    if (!canCallShog) return;
    onAction({ type: 'call-shog', suit });
  };

  const renderSeatPill = (seatLayout: SeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === player.id && !state.trickWinner;
    const isMe = player.id === myId;
    const seatPillStateClass = isCurrentTurn
      ? isMe
        ? 'river-seatPill--activeSelf'
        : 'river-seatPill--activeOther'
      : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const cardsLeft = player.hand.length + player.frontPiles.reduce((sum, pile) => {
      let count = sum;
      if (pile.topCard) count += 1;
      if (pile.bottomCard) count += 1;
      return count;
    }, 0);
    const roundPoints = state.roundCardPoints[player.id] ?? 0;

    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`river-seatPill ${seatPillStateClass} ${isMe ? 'river-seatPill--me' : ''}`}
      >
        <div className="river-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <span className="river-seatName">{isMe ? 'You' : player.name}</span>
        </div>
        <div className="river-seatPillLabels">
          <span className="river-seatCell river-seatCell--bid">Score</span>
          <span className="river-seatCell river-seatCell--tricks">Left</span>
          <span className="river-seatCell river-seatCell--total">Rnd</span>
        </div>
        <div className="river-seatPillValues">
          <span className="river-seatCell river-seatCell--bid">{player.totalScore}</span>
          <span className="river-seatCell river-seatCell--tricks">{cardsLeft}</span>
          <span className="river-seatCell river-seatCell--total">{roundPoints}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`river-board river-board--players-${state.players.length} space-y-3 sm:space-y-4`}>
      <div ref={tableRef} className={`river-table river-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`river-seat ${layout.relativeIndex === 0 ? 'river-seat--self' : ''}`}
            style={{ left: `${layout.seatLeft}%`, top: `${layout.seatTop}%` }}
          >
            <div className={`twelve-seatStack ${isHandZoomed ? 'twelve-seatStack--zoom' : ''}`}>
              {renderSeatPill(layout, layout.relativeIndex === 0)}
              <div className="twelve-pileRow">
                {layout.player.frontPiles.map((pile, pileIndex) => {
                  const playable = getPilePlayableCard(pile);
                  const canPlayPile =
                    layout.player.id === myId &&
                    canUseActionButtons &&
                    !!playable &&
                    myIndex >= 0 &&
                    isLegalPlay(state, myIndex, playable.card, 'pile', pileIndex);
                  return (
                    <button
                      key={`${layout.player.id}-pile-${pileIndex}`}
                      type="button"
                      onClick={() => playPileCard(pileIndex)}
                      disabled={!canPlayPile}
                      className="twelve-pileButton"
                      aria-label={`Pile ${pileIndex + 1}`}
                    >
                      <div className="twelve-pileBottom">
                        {pile.bottomCard ? (
                          <PokerFlipCard card={pile.bottomCard} faceDown={!pile.bottomFaceUp} />
                        ) : (
                          <div className="twelve-pilePlaceholder" />
                        )}
                      </div>
                      {pile.topCard && (
                        <div className="twelve-pileTop">
                          {renderCardFace(pile.topCard, !canPlayPile, true)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
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
                const canPlay =
                  canUseActionButtons &&
                  myIndex >= 0 &&
                  isLegalPlay(state, myIndex, card, 'hand');
                const isDisabled = !canPlay;
                const isLast = i === myPlayer.hand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;
                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}-${i}`}
                    type="button"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => playHandCard(card)}
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
                      style={{ width: `${handLayout.cardWidth}px`, height: `${handLayout.cardHeight}px` }}
                    >
                      {renderCardFace(card, state.phase === 'playing' && isDisabled)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="river-actionRow">
            <div className="twelve-actionPanel">
              <div className="twelve-actionGroup">
                <span className="twelve-actionLabel">Set Trump</span>
                <div className="twelve-actionButtons">
                  {myRoyalSuits.length > 0 ? myRoyalSuits.map((suit) => (
                    <button
                      key={`set-${suit}`}
                      type="button"
                      disabled={!canSetTrump}
                      onClick={() => setTrump(suit)}
                      className="twelve-actionButton"
                    >
                      {SUIT_SYMBOLS[suit]}
                    </button>
                  )) : (
                    <button type="button" disabled className="twelve-actionButton">—</button>
                  )}
                </div>
              </div>

              <div className="twelve-actionGroup">
                <span className="twelve-actionLabel">Call Shog</span>
                <div className="twelve-actionButtons">
                  {myShogSuits.length > 0 ? myShogSuits.map((suit) => (
                    <button
                      key={`shog-${suit}`}
                      type="button"
                      disabled={!canCallShog}
                      onClick={() => callShog(suit)}
                      className="twelve-actionButton"
                    >
                      {SUIT_SYMBOLS[suit]}
                    </button>
                  )) : (
                    <button type="button" disabled className="twelve-actionButton">—</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
