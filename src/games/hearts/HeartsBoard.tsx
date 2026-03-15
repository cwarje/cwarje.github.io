import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { HeartsState, Card, Suit, HeartsPlayer } from './types';
import { isValidHeartsPlay } from './rules';
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

function getPlayerColorHex(player: HeartsPlayer): string {
  return PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
}

function getFittedTextSize(text: string, availableWidth: number, minSize: number, maxSize: number): number {
  if (typeof document === 'undefined' || availableWidth <= 0) return minSize;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return maxSize;

  for (let size = maxSize; size >= minSize; size -= 0.5) {
    context.font = `700 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
    if (context.measureText(text).width <= availableWidth) return size;
  }

  return minSize;
}

interface AutoFitSeatNameProps {
  name: string;
  textColor: string;
}

function AutoFitSeatName({ name, textColor }: AutoFitSeatNameProps) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(13);

  useEffect(() => {
    const node = nameRef.current;
    if (!node) return;

    const recalc = () => {
      const availableWidth = Math.max(0, node.clientWidth - 2);
      const fittedSize = getFittedTextSize(name, availableWidth, 8, 14);
      setFontSize(prev => (Math.abs(prev - fittedSize) < 0.1 ? prev : fittedSize));
    };

    recalc();
    const resizeObserver = new ResizeObserver(recalc);
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, [name]);

  return (
    <span ref={nameRef} className="hearts-seatPillName" style={{ fontSize: `${fontSize}px`, color: textColor }}>
      {name}
    </span>
  );
}

type Seat = 'bottom' | 'left' | 'top' | 'right';
interface TrickSlotPlacement {
  row: number;
  col: number;
  dx: string;
  dy: string;
}

const SEATS: Seat[] = ['bottom', 'left', 'top', 'right'];
const TRICK_EXIT_OFFSETS: Record<Seat, { x: number; y: number }> = {
  top: { x: 0, y: -72 },
  left: { x: -72, y: 0 },
  right: { x: 72, y: 0 },
  bottom: { x: 0, y: 72 },
};
const TRICK_SLOT_PLACEMENTS: Record<Seat, TrickSlotPlacement> = {
  bottom: { row: 2, col: 2, dx: '0px', dy: '0px' },
  left: { row: 2, col: 1, dx: '0px', dy: 'calc(var(--hearts-slot-h) * -0.5)' },
  top: { row: 1, col: 2, dx: '0px', dy: '0px' },
  right: { row: 2, col: 3, dx: '0px', dy: 'calc(var(--hearts-slot-h) * -0.5)' },
};

function getTrickExitOffset(winnerSeat: Seat | null): { x: number; y: number } {
  if (!winnerSeat) return { x: 0, y: 20 };
  return TRICK_EXIT_OFFSETS[winnerSeat];
}

function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function getSeatForPlayerIndex(playerIndex: number, myIndex: number, playerCount: number): Seat {
  const relative = (playerIndex - myIndex + playerCount) % playerCount;
  return SEATS[relative] ?? 'bottom';
}

function getSeatPlayer(state: HeartsState, myIndex: number, seat: Seat): { player: HeartsPlayer | null; index: number } {
  const targetRelative = SEATS.indexOf(seat);
  if (targetRelative === -1) return { player: null, index: -1 };
  const index = (myIndex + targetRelative) % state.players.length;
  return { player: state.players[index] ?? null, index };
}

interface HeartsBoardProps {
  state: HeartsState;
  myId: string;
  onAction: (action: unknown) => void;
  isHandZoomed?: boolean;
}

export default function HeartsBoard({ state, myId, onAction, isHandZoomed = false }: HeartsBoardProps) {
  const myIndex = state.players.findIndex(p => p.id === myId);
  const myPlayer = state.players[myIndex];
  const isMyTurn = state.currentPlayerIndex === myIndex;
  const handContainerRef = useRef<HTMLDivElement>(null);
  const [handWidth, setHandWidth] = useState(360);

  const selectedPass = state.passSelections[myId] || [];
  const myPassConfirmed = state.passConfirmed[myId] || false;

  const togglePassCard = (card: Card) => {
    if (myPassConfirmed) return; // Can't change selection after confirming
    const isSelected = selectedPass.some(c => cardEquals(c, card));
    let newSelection: Card[];
    if (isSelected) {
      newSelection = selectedPass.filter(c => !cardEquals(c, card));
    } else {
      if (selectedPass.length >= 3) return;
      newSelection = [...selectedPass, card];
    }
    onAction({ type: 'select-pass', cards: newSelection });
  };

  const confirmPass = () => {
    if (selectedPass.length === 3) {
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

  const trickBySeat = useMemo(() => {
    const mapped: Partial<Record<Seat, { playerId: string; card: Card }>> = {};
    state.currentTrick.forEach((entry) => {
      const index = state.players.findIndex(p => p.id === entry.playerId);
      if (index === -1) return;
      const seat = getSeatForPlayerIndex(index, myIndex, state.players.length);
      mapped[seat] = entry;
    });
    return mapped;
  }, [state.currentTrick, state.players, myIndex]);

  const trickWinnerSeat = useMemo(() => {
    if (!state.trickWinner) return null;
    const winnerIndex = state.players.findIndex(p => p.id === state.trickWinner);
    if (winnerIndex === -1) return null;
    return getSeatForPlayerIndex(winnerIndex, myIndex, state.players.length);
  }, [state.trickWinner, state.players, myIndex]);

  const trickWinnerPlayer = useMemo(
    () => (state.trickWinner ? state.players.find(p => p.id === state.trickWinner) ?? null : null),
    [state.players, state.trickWinner],
  );
  const trickExitOffset = useMemo(() => getTrickExitOffset(trickWinnerSeat), [trickWinnerSeat]);

  const headsUpContent = useMemo((): ReactNode => {
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
                  <span style={{ color: getPlayerColorHex(p) }}>{p.name}</span>
                </span>
              ))}
              ...
            </>
          );
        }
        return 'All players confirmed. Starting round...';
      }
      return `Pass 3 cards ${state.passDirection} · Selected ${selectedPass.length}/3`;
    }
    if (state.trickWinner && trickWinnerPlayer) {
      return (
        <>
          <span style={{ color: getPlayerColorHex(trickWinnerPlayer) }}>{trickWinnerPlayer.name}</span>
          {' won the trick'}
        </>
      );
    }
    if (state.phase === 'playing' && isMyTurn) {
      return 'Your turn';
    }
    return null;
  }, [
    state.phase,
    state.passDirection,
    selectedPass.length,
    myPassConfirmed,
    state.players,
    state.passConfirmed,
    state.trickWinner,
    trickWinnerPlayer,
    isMyTurn,
  ]);

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

  const showActiveSeatPill = state.players.length > 1;

  const renderSeatPill = (seat: Seat) => {
    const { player } = getSeatPlayer(state, myIndex, seat);
    if (!player) return null;

    const isCurrentTurn =
      state.phase === 'playing' && !state.trickWinner && state.players[state.currentPlayerIndex]?.id === player.id;
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

  const renderCardFace = (card: Card, disabled = false, selected = false, compact = false) => (
    <div
      className={`hearts-card ${disabled ? 'hearts-card--disabled' : ''} ${selected ? 'hearts-card--selected' : ''} ${compact ? 'hearts-card--compact' : ''}`}
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
    <div className="hearts-board space-y-4 sm:space-y-5">
      <div className="hearts-table">
        <div className="hearts-seat hearts-seat--top">{renderSeatPill('top')}</div>
        <div className="hearts-seat hearts-seat--left">{renderSeatPill('left')}</div>
        <div className="hearts-seat hearts-seat--right">{renderSeatPill('right')}</div>
        <div className="hearts-seat hearts-seat--bottom">{renderSeatPill('bottom')}</div>

        <div className={`hearts-center ${isHandZoomed ? 'hearts-center--zoom' : ''}`}>
          <div className="hearts-centerGrid">
            {(['top', 'left', 'right', 'bottom'] as Seat[]).map((seat) => {
              const trickEntry = trickBySeat[seat];
              const isWinningCard = trickWinnerSeat === seat && !!state.trickWinner;
              const placement = TRICK_SLOT_PLACEMENTS[seat];
              const trickEntryOffset = TRICK_EXIT_OFFSETS[seat];
              return (
                <div
                  key={seat}
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
                      <div key={`placeholder-${seat}`} className="hearts-slotPlaceholder" />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hearts-headsUp" aria-live="polite">
        <p className="hearts-headsUpText">
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
              {myPlayer.hand.map((card, i) => {
                const isSelectedForPass = selectedPass.some(c => cardEquals(c, card));
                const canPlay = state.phase === 'playing' && isMyTurn && !state.trickWinner && isValidHeartsPlay(state, myIndex, card);
                const isPassing = state.phase === 'passing' && !myPassConfirmed;
                const isDisabled = !isPassing && !canPlay;
                const isLast = i === myPlayer.hand.length - 1;
                const hitboxWidth = isLast ? handLayout.cardWidth : handLayout.step;

                return (
                  <motion.button
                    key={`${card.suit}-${card.rank}`}
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
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
                      {renderCardFace(card, isDisabled, isSelectedForPass)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="min-h-[56px] sm:min-h-[62px] flex items-start justify-center pt-[12px] sm:pt-[18px]">
            {state.phase === 'passing' && selectedPass.length === 3 && !myPassConfirmed && (
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
