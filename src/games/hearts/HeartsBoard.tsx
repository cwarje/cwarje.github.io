import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { HeartsState, Card, Suit, HeartsPlayer } from './types';
import { isValidHeartsPlay } from './rules';

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

type Seat = 'bottom' | 'left' | 'top' | 'right';

const SEATS: Seat[] = ['bottom', 'left', 'top', 'right'];

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
}

export default function HeartsBoard({ state, myId, onAction }: HeartsBoardProps) {
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

  const trickWinnerName = useMemo(
    () => state.players.find(p => p.id === state.trickWinner)?.name,
    [state.players, state.trickWinner],
  );

  const headsUpMessage = useMemo(() => {
    if (state.phase === 'passing') {
      return `Pass 3 cards ${state.passDirection} · Selected ${selectedPass.length}/3`;
    }
    if (state.trickWinner && trickWinnerName) {
      return `${trickWinnerName} wins this trick`;
    }
    if (state.phase === 'playing' && isMyTurn) {
      return 'Your turn';
    }
    return '';
  }, [state.phase, state.passDirection, selectedPass.length, state.trickWinner, trickWinnerName, isMyTurn]);

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

  const renderSeatPill = (seat: Seat) => {
    const { player } = getSeatPlayer(state, myIndex, seat);
    if (!player) return null;

    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === player.id;
    const isMe = player.id === myId;
    return (
      <div
        className={`hearts-seatPill ${isCurrentTurn ? 'hearts-seatPill--active' : ''} ${isMe ? 'hearts-seatPill--me' : ''}`}
      >
        <div className="hearts-seatPillTop">
          <span className="hearts-seatPillName">
            {player.name}
            {isMe ? ' (You)' : ''}
          </span>
          <span className="hearts-seatPillScore">{player.totalScore}</span>
        </div>
        <div className="hearts-seatPillBottom">
          <span>Round {player.roundScore}</span>
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
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="hearts-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        <Trophy className="w-14 h-14 text-black mx-auto" />
        <h2 className="text-3xl font-extrabold text-black">Game Over</h2>
        <div className="space-y-3 w-full max-w-2xl">
          {sorted.map((p, i) => (
            <div key={p.id} className="hearts-resultRow">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">#{i + 1}</span>
                <span className="font-semibold">{p.name}</span>
              </div>
              <span className="text-xl font-bold">{p.totalScore} pts</span>
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

        <div className="hearts-center">
          {(['top', 'left', 'right', 'bottom'] as Seat[]).map((seat) => {
            const trickEntry = trickBySeat[seat];
            const isWinningCard = trickWinnerSeat === seat && !!state.trickWinner;
            return (
              <div key={seat} className={`hearts-slot hearts-slot--${seat}`}>
                {trickEntry ? (
                  <motion.div
                    key={`${state.trickNumber}-${trickEntry.playerId}-${trickEntry.card.suit}-${trickEntry.card.rank}`}
                    initial={{ scale: 0.8, opacity: 0, y: 12 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    className={`hearts-slotCard ${isWinningCard ? 'hearts-slotCard--winner' : ''}`}
                  >
                    {renderCardFace(trickEntry.card, false, false, true)}
                  </motion.div>
                ) : (
                  <div className="hearts-slotPlaceholder" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="hearts-headsUp" aria-live="polite">
        <p className="hearts-headsUpText">
          {headsUpMessage || '\u00a0'}
        </p>
      </div>

      {myPlayer && (
        <div className="space-y-3">
          <div ref={handContainerRef} className="hearts-hand">
            <div
              className="hearts-handSpread"
              style={{
                width: `${handLayout.spreadWidth}px`,
                height: `${handLayout.cardHeight + handLayout.selectedLift}px`,
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
                      className={`hearts-handCardWrap ${canPlay || isPassing ? 'hearts-handCardWrap--active' : ''}`}
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

          <div className="min-h-[56px] flex items-center justify-center">
            {state.phase === 'passing' && selectedPass.length === 3 && !myPassConfirmed && (
              <button onClick={confirmPass} className="hearts-actionButton">
                Confirm Pass
              </button>
            )}
            {state.phase === 'passing' && myPassConfirmed && (() => {
              const waitingOn = state.players.filter(p => !p.isBot && !state.passConfirmed[p.id]);
              return waitingOn.length > 0 ? (
                <div className="hearts-passStatus">
                  <p>Waiting on {waitingOn.map(p => p.name).join(', ')}...</p>
                </div>
              ) : (
                <div className="hearts-passStatus">
                  <p>All players confirmed. Starting round...</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
