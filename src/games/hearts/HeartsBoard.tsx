import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { HeartsState, Card, Suit, HeartsPlayer } from './types';
import { isValidHeartsPlay } from './rules';
import { getHeartsPassCount } from './logic';
import { DARK_PLAYER_COLORS, DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import { AutoFitSeatName } from '../shared/AutoFitSeatName';
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

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function placementLabel(position: number): string {
  if (position % 100 >= 11 && position % 100 <= 13) return `${position}th`;
  if (position % 10 === 1) return `${position}st`;
  if (position % 10 === 2) return `${position}nd`;
  if (position % 10 === 3) return `${position}rd`;
  return `${position}th`;
}

interface HeartsSeatLayout {
  relativeIndex: number;
  playerIndex: number;
  player: HeartsPlayer;
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

const HEARTS_SEAT_EDGE_GAP_PX = 8;
const TRICK_EXIT_DISTANCE_PX = 72;

function getLayoutRadii(playerCount: number): { seatRadiusX: number; seatRadiusY: number } {
  if (playerCount >= 5) {
    return { seatRadiusX: 37, seatRadiusY: 32 };
  }
  return { seatRadiusX: 35, seatRadiusY: 30 };
}

const TRICK_SLOT_PLACEMENTS: Record<number, TrickSlotPlacement[]> = {
  4: [
    { row: 2, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 1, dx: '0px', dy: 'calc(var(--hearts-slot-h) * -0.5)' },
    { row: 1, col: 2, dx: '0px', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: 'calc(var(--hearts-slot-h) * -0.5)' },
  ],
  5: [
    { row: 2, col: 2, dx: '0px', dy: 'calc(var(--hearts-slot-h) * 0.25)' },
    { row: 2, col: 1, dx: '0px', dy: '0px' },
    { row: 1, col: 1, dx: 'calc(var(--hearts-slot-w) * 0.5)', dy: '0px' },
    { row: 1, col: 3, dx: 'calc(var(--hearts-slot-w) * -0.5)', dy: '0px' },
    { row: 2, col: 3, dx: '0px', dy: '0px' },
  ],
};

function getTrickSlotPlacement(playerCount: number, relativeIndex: number): TrickSlotPlacement {
  const layout = TRICK_SLOT_PLACEMENTS[playerCount]?.[relativeIndex];
  if (layout) return layout;
  return { row: 2, col: 2, dx: '0px', dy: '0px' };
}

function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function cardKey(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

interface HeartsBoardProps {
  state: HeartsState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
}

export default function HeartsBoard({ state, myId, onAction, isHandZoomed = false }: HeartsBoardProps) {
  const myIndex = state.players.findIndex(p => p.id === myId);
  const anchorIndex = myIndex >= 0 ? myIndex : 0;
  const myPlayer = state.players[myIndex];
  const isMyTurn = state.currentPlayerIndex === myIndex;
  const passCount = getHeartsPassCount(state.players.length);
  const boardRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);
  const [tableSize, setTableSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [seatPillElement, setSeatPillElement] = useState<HTMLDivElement | null>(null);
  const [seatPillSize, setSeatPillSize] = useState<ElementSize>({ width: 0, height: 0 });
  const handBeforePassRef = useRef<Card[]>([]);
  const prevPhaseRef = useRef(state.phase);
  const [receivedCardKeys, setReceivedCardKeys] = useState<Set<string>>(() => new Set());

  const selectedPass = state.passSelections[myId] || [];
  const myPassConfirmed = state.passConfirmed[myId] || false;

  const togglePassCard = (card: Card) => {
    if (myPassConfirmed) return; // Can't change selection after confirming
    const isSelected = selectedPass.some(c => cardEquals(c, card));
    let newSelection: Card[];
    if (isSelected) {
      newSelection = selectedPass.filter(c => !cardEquals(c, card));
    } else {
      if (selectedPass.length >= passCount) return;
      newSelection = [...selectedPass, card];
    }
    onAction({ type: 'select-pass', cards: newSelection });
  };

  const confirmPass = () => {
    if (selectedPass.length === passCount) {
      onAction({ type: 'confirm-pass' });
    }
  };

  const playCard = (card: Card) => {
    if (!isMyTurn) return;
    if (!isValidHeartsPlay(state, myIndex, card)) return;
    onAction({ type: 'play-card', card });
  };

  useEffect(() => {
    const element = handContainerRef.current;
    if (!element) return;

    const updateSize = () => setHandWidth(element.clientWidth);
    updateSize();

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

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
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;

    if (prevPhase === 'passing' && state.phase === 'playing' && state.passDirection !== 'none') {
      const before = handBeforePassRef.current;
      const after = myPlayer?.hand ?? [];
      const received = after.filter(c => !before.some(b => cardEquals(b, c)));
      if (received.length > 0) {
        setReceivedCardKeys(new Set(received.map(cardKey)));
      }
    }

    if (state.phase === 'passing') {
      handBeforePassRef.current = myPlayer?.hand ?? [];
      setReceivedCardKeys(new Set());
    }
  }, [state.phase, state.passDirection, myPlayer?.hand]);

  const seatLayouts = useMemo<HeartsSeatLayout[]>(() => {
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
          const usableHalfWidth = tableSize.width / 2 - seatPillSize.width / 2 - HEARTS_SEAT_EDGE_GAP_PX;
          const usableHalfHeight = tableSize.height / 2 - seatPillSize.height / 2 - HEARTS_SEAT_EDGE_GAP_PX;
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
    dealKey: String(state.roundNumber),
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
    const winnerIndex = state.players.findIndex(p => p.id === state.trickWinner);
    if (winnerIndex === -1) return null;
    return (winnerIndex - anchorIndex + state.players.length) % state.players.length;
  }, [state.trickWinner, state.players, anchorIndex]);

  const trickWinnerPlayer = useMemo(
    () => (state.trickWinner ? state.players.find(p => p.id === state.trickWinner) ?? null : null),
    [state.players, state.trickWinner],
  );

  const moonShooterPlayer = useMemo(
    () => (state.moonShooterId ? state.players.find(p => p.id === state.moonShooterId) ?? null : null),
    [state.players, state.moonShooterId],
  );

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
    if (state.moonShooterId && moonShooterPlayer) {
      return (
        <>
          <span style={{ color: getPlayerHudTextColor(moonShooterPlayer.color) }}>{moonShooterPlayer.name}</span>
          {' shot the moon!'}
        </>
      );
    }
    if (state.phase === 'passing') {
      if (myPassConfirmed) {
        const waitingOn = state.players.filter(p => !p.isBot && !state.passConfirmed[p.id]);
        if (waitingOn.length > 0) {
          return (
            <>
              {'Waiting on '}
              {waitingOn.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <span style={{ color: getPlayerHudTextColor(p.color) }}>{p.name}</span>
                </span>
              ))}
              ...
            </>
          );
        }
        return 'All players confirmed. Starting round...';
      }
      return `Pass ${passCount} cards ${state.passDirection} · Selected ${selectedPass.length}/${passCount}`;
    }
    if (state.trickWinner && trickWinnerPlayer) {
      return (
        <>
          <span style={{ color: getPlayerHudTextColor(trickWinnerPlayer.color) }}>{trickWinnerPlayer.name}</span>
          {' won the trick'}
        </>
      );
    }
    if (state.phase === 'playing' && isMyTurn) {
      return 'Your turn';
    }
    return null;
  }, [
    state.moonShooterId,
    moonShooterPlayer,
    state.phase,
    state.passDirection,
    selectedPass.length,
    myPassConfirmed,
    state.players,
    state.passConfirmed,
    state.trickWinner,
    trickWinnerPlayer,
    isMyTurn,
    passCount,
  ]);

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

  const showActiveSeatPill = state.players.length > 1;

  const renderSeatPill = (seatLayout: HeartsSeatLayout, shouldMeasure = false) => {
    const player = seatLayout.player;
    const isCurrentTurn =
      state.phase === 'playing' && !state.trickWinner && !state.moonShooterId && state.players[state.currentPlayerIndex]?.id === player.id;
    const isMe = player.id === myId;
    const activeSeatPillClass =
      isCurrentTurn && showActiveSeatPill
        ? isMe
          ? 'hearts-seatPill--activeSelf'
          : 'hearts-seatPill--activeOther'
        : '';
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    return (
      <div
        ref={shouldMeasure ? setSeatPillElement : undefined}
        className={`hearts-seatPill ${activeSeatPillClass} ${isMe ? 'hearts-seatPill--me' : ''}`}
      >
        <div className="hearts-seatPillTop" style={{ backgroundColor: seatColor }}>
          <AutoFitSeatName name={isMe ? 'You' : player.name} textColor={seatTextColor} />
        </div>
        <div className="hearts-seatPillBottom">
          <span className="hearts-seatPillRound">{player.roundScore}</span>
          <span className="hearts-seatPillTotal">{player.totalScore}</span>
        </div>
      </div>
    );
  };

  const renderCardFace = (card: Card, disabled = false, selected = false, compact = false, received = false) => (
    <div
      className={`hearts-card ${disabled ? 'hearts-card--disabled' : ''} ${selected ? 'hearts-card--selected' : ''} ${compact ? 'hearts-card--compact' : ''} ${received ? 'hearts-card--received' : ''}`}
    >
      <div className="hearts-cardCorner">
        <span className={`hearts-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
        <span className={`hearts-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  if (state.gameOver) {
    const sorted = [...state.players].sort((a, b) => a.totalScore - b.totalScore);
    const groupedPlacements = sorted.reduce<{ placement: number; score: number; players: HeartsPlayer[] }[]>((groups, player) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.score === player.totalScore) {
        lastGroup.players.push(player);
        return groups;
      }

      const priorPlayersCount = groups.reduce((count, group) => count + group.players.length, 0);
      groups.push({
        placement: priorPlayersCount + 1,
        score: player.totalScore,
        players: [player],
      });
      return groups;
    }, []);

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="hearts-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
        <h2 className="text-3xl font-extrabold text-white">Game Over</h2>
        <div className="space-y-3 w-full max-w-2xl">
          {groupedPlacements.map((group) => (
            <div key={`placement-${group.placement}-${group.score}`} className="hearts-resultRow">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">{placementLabel(group.placement)}</span>
                <span className="font-semibold">{group.players.map(player => player.name).join(', ')}</span>
              </div>
              <span className="text-xl font-bold">{group.score} pts</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div ref={boardRef} className={`hearts-board hearts-board--players-${state.players.length} relative space-y-4 sm:space-y-5`}>
      <DealAnimationLayer flights={deal.flights} dealCenter={deal.dealCenter} remaining={deal.flights.length} />
      <div ref={tableRef} className={`hearts-table hearts-table--players-${state.players.length}`}>
        {seatLayouts.map((layout) => (
          <div
            key={`seat-${layout.player.id}`}
            className={`hearts-seat ${layout.relativeIndex === 0 ? 'hearts-seat--self' : ''}`}
            style={{
              left: `${layout.seatLeft}%`,
              top: `${layout.seatTop}%`,
            }}
          >
            {renderSeatPill(layout, layout.relativeIndex === 0)}
          </div>
        ))}

        <div className={`hearts-center ${isHandZoomed ? 'hearts-center--zoom' : ''}`}>
          <div className="hearts-centerGrid">
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
                  className={`hearts-slot ${trickEntry ? 'hearts-slot--filled' : 'hearts-slot--empty'}`}
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
                        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                        className={`hearts-slotCard ${isWinningCard ? 'hearts-slotCard--winner' : ''}`}
                      >
                        <div className="hearts-slotCardInner">
                          {renderCardFace(trickEntry.card, false, false, true)}
                        </div>
                      </motion.div>
                    ) : (
                      <div key={`placeholder-${layout.relativeIndex}`} className="hearts-slotPlaceholder" />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hearts-headsUp" aria-live="polite">
        <p className={`hearts-headsUpText ${state.moonShooterId ? 'hearts-headsUpText--moonShot' : ''}`}>
          {headsUpContent ?? '\u00a0'}
        </p>
      </div>

      {myPlayer && (
        <div>
          <div ref={handContainerRef} className={`hearts-hand ${isHandZoomed ? 'hearts-hand--zoom' : ''}`}>
            <div
              className="hearts-handSpread"
              style={{
                width: `${handLayout.spreadWidth}px`,
                height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                transition: 'width 0.16s ease',
              }}
            >
              {visibleHand.map((card, i) => {
                const isSelectedForPass = selectedPass.some(c => cardEquals(c, card));
                const canPlay = state.phase === 'playing' && isMyTurn && !state.trickWinner && !state.moonShooterId && isValidHeartsPlay(state, myIndex, card);
                const isPassing = state.phase === 'passing' && !myPassConfirmed;
                const isDisabled = !isPassing && !canPlay;
                const isLast = i === visibleHand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;
                const isReceived = receivedCardKeys.has(cardKey(card));

                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}`}
                    initial={deal.isDealing ? { scale: 0.6, opacity: 0 } : { y: 50, opacity: 0 }}
                    animate={deal.isDealing ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }}
                    transition={deal.isDealing ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : { delay: i * 0.02 }}
                    onClick={() => {
                      if (isPassing) togglePassCard(card);
                      else if (canPlay) playCard(card);
                    }}
                    disabled={isDisabled}
                    className="hearts-handHitbox"
                    style={{
                      left: `${i * handLayout.step}px`,
                      width: `${hitboxWidth}px`,
                      height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
                      zIndex: i + 1,
                    }}
                    aria-label={`Play ${rankDisplay(card.rank)} of ${card.suit}`}
                  >
                    <span
                      className={`hearts-handCardWrap ${canPlay || isPassing ? (isSelectedForPass ? '' : 'hearts-handCardWrap--active') : ''}`}
                      style={{
                        width: `${handLayout.cardWidth}px`,
                        height: `${handLayout.cardHeight}px`,
                        transform: isSelectedForPass ? `translateY(-${handLayout.selectedLift}px)` : 'translateY(0px)',
                      }}
                    >
                      {renderCardFace(card, isDisabled, isSelectedForPass, false, isReceived)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="min-h-[56px] sm:min-h-[62px] flex items-start justify-center pt-[12px] sm:pt-[18px]">
            {state.phase === 'passing' && selectedPass.length === passCount && !myPassConfirmed && (
              <button onClick={confirmPass} className="hearts-actionButton">
                Confirm Pass
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
