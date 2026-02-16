import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
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

type Seat = 'bottom' | 'left' | 'top' | 'right';

const SEATS: Seat[] = ['bottom', 'left', 'top', 'right'];

interface UpRiverBoardProps {
  state: UpRiverState;
  myId: string;
  onAction: (action: unknown) => void;
}

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function getSeatForPlayerIndex(playerIndex: number, myIndex: number, playerCount: number): Seat {
  const relative = (playerIndex - myIndex + playerCount) % playerCount;
  return SEATS[relative] ?? 'bottom';
}

function getSeatPlayer(state: UpRiverState, myIndex: number, seat: Seat): { player: UpRiverPlayer | null; index: number } {
  const targetRelative = SEATS.indexOf(seat);
  if (targetRelative === -1) return { player: null, index: -1 };
  const index = (myIndex + targetRelative) % state.players.length;
  return { player: state.players[index] ?? null, index };
}

export default function UpAndDownTheRiverBoard({ state, myId, onAction }: UpRiverBoardProps) {
  const myIndex = state.players.findIndex(player => player.id === myId);
  const myPlayer = state.players[myIndex];
  const isMyTurn = state.currentPlayerIndex === myIndex;

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
    const winnerIndex = state.players.findIndex(player => player.id === state.trickWinner);
    if (winnerIndex === -1) return null;
    return getSeatForPlayerIndex(winnerIndex, myIndex, state.players.length);
  }, [state.players, state.trickWinner, myIndex]);

  const headsUpMessage = useMemo(() => {
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

  const renderCardFace = (card: Card, disabled = false, compact = false) => (
    <div className={`river-card ${disabled ? 'river-card--disabled' : ''} ${compact ? 'river-card--compact' : ''}`}>
      <div className="river-cardCorner">
        <span className={`river-cardRank ${SUIT_COLORS[card.suit]}`}>{rankDisplay(card.rank)}</span>
        <span className={`river-cardSuit ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );

  const renderSeatPill = (seat: Seat) => {
    const { player } = getSeatPlayer(state, myIndex, seat);
    if (!player) return null;

    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === player.id && !state.trickWinner;
    const isMe = player.id === myId;
    const seatColor = PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
    const seatTextColor = DARK_PLAYER_COLORS.has(player.color) ? '#ffffff' : '#111827';
    const bidText = player.bid === null ? '-' : String(player.bid);

    return (
      <div className={`river-seatPill ${isCurrentTurn ? 'river-seatPill--active' : ''} ${isMe ? 'river-seatPill--me' : ''}`}>
        <div className="river-seatPillTop" style={{ backgroundColor: seatColor, color: seatTextColor }}>
          <span className="river-seatName">{isMe ? 'You' : player.name}</span>
        </div>
        <div className="river-seatPillStats">
          <span>B: {bidText}</span>
          <span>T: {player.tricksWon}</span>
          <span>Total: {player.totalScore}</span>
        </div>
      </div>
    );
  };

  const playCard = (card: Card) => {
    if (state.phase !== 'playing' || !isMyTurn || state.trickWinner) return;
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
        <Trophy className="w-14 h-14 text-black mx-auto" />
        <h2 className="text-3xl font-extrabold text-black">Game Over</h2>
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
    <div className="river-board space-y-3 sm:space-y-4">
      <div className="river-table">
        <div className="river-seat river-seat--top">{renderSeatPill('top')}</div>
        <div className="river-seat river-seat--left">{renderSeatPill('left')}</div>
        <div className="river-seat river-seat--right">{renderSeatPill('right')}</div>
        <div className="river-seat river-seat--bottom">{renderSeatPill('bottom')}</div>

        <div className="river-center">
          {(['top', 'left', 'right', 'bottom'] as Seat[]).map((seat) => {
            const trickEntry = trickBySeat[seat];
            const isWinningCard = trickWinnerSeat === seat && !!state.trickWinner;
            return (
              <div
                key={seat}
                className={`river-slot river-slot--${seat} ${trickEntry ? 'river-slot--filled' : 'river-slot--empty'}`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {trickEntry ? (
                    <motion.div
                      key={`${state.trickNumber}-${trickEntry.playerId}-${trickEntry.card.suit}-${trickEntry.card.rank}`}
                      initial={{ scale: 0.8, opacity: 0, y: 12 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className={`river-slotCard ${isWinningCard ? 'river-slotCard--winner' : ''}`}
                    >
                      {renderCardFace(trickEntry.card, false, true)}
                    </motion.div>
                  ) : (
                    <div key={`placeholder-${seat}`} className="river-slotPlaceholder" />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <div className="river-headsUp" aria-live="polite">
        <p className="river-headsUpText">{headsUpMessage || '\u00a0'}</p>
      </div>

      {myPlayer && (
        <div className="space-y-3">
          <div className="river-hand">
            {myPlayer.hand.map((card) => {
              const canPlay = state.phase === 'playing' && isMyTurn && !state.trickWinner && isValidUpRiverPlay(state, myIndex, card);
              const isDisabled = !canPlay;
              return (
                <button
                  key={`${card.suit}-${card.rank}`}
                  type="button"
                  onClick={() => playCard(card)}
                  disabled={isDisabled}
                  className={`river-handCard ${canPlay ? 'river-handCard--active' : ''}`}
                  aria-label={`Play ${rankDisplay(card.rank)} of ${card.suit}`}
                >
                  {renderCardFace(card, isDisabled)}
                </button>
              );
            })}
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
