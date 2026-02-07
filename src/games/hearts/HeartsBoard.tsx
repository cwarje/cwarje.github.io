import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import type { HeartsState, Card, Suit } from './types';

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<Suit, string> = {
  hearts: 'text-red-400',
  diamonds: 'text-red-400',
  clubs: 'text-white',
  spades: 'text-white',
};

function rankDisplay(rank: number): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

function isValidPlay(state: HeartsState, playerIndex: number, card: Card): boolean {
  const player = state.players[playerIndex];
  const hand = player.hand;

  if (state.trickNumber === 1 && state.currentTrick.length === 0) {
    return card.suit === 'clubs' && card.rank === 2;
  }

  if (state.currentTrick.length > 0) {
    const leadSuit = state.currentTrick[0].card.suit;
    const hasSuit = hand.some(c => c.suit === leadSuit);
    if (hasSuit && card.suit !== leadSuit) return false;
  }

  if (state.currentTrick.length === 0 && card.suit === 'hearts' && !state.heartsBroken) {
    const hasNonHearts = hand.some(c => c.suit !== 'hearts');
    if (hasNonHearts) return false;
  }

  if (state.trickNumber === 1 && state.currentTrick.length > 0) {
    const leadSuit = state.currentTrick[0].card.suit;
    const hasSuit = hand.some(c => c.suit === leadSuit);
    if (!hasSuit && (card.suit === 'hearts' || (card.suit === 'spades' && card.rank === 12))) {
      const hasNonPointCards = hand.some(c => !(c.suit === 'hearts' || (c.suit === 'spades' && c.rank === 12)));
      if (hasNonPointCards) return false;
    }
  }

  return true;
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

  const selectedPass = state.passSelections[myId] || [];

  const togglePassCard = (card: Card) => {
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
    if (!isValidPlay(state, myIndex, card)) return;
    onAction({ type: 'play-card', card });
  };

  if (state.gameOver) {
    const sorted = [...state.players].sort((a, b) => a.totalScore - b.totalScore);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-6 text-center">
        <Trophy className="w-16 h-16 text-amber-400 mx-auto" />
        <h2 className="text-3xl font-extrabold text-white">Game Over!</h2>
        <div className="space-y-3">
          {sorted.map((p, i) => (
            <div key={p.id} className={`flex items-center justify-between px-5 py-3 rounded-xl ${i === 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'glass-light'}`}>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${i === 0 ? 'text-amber-400' : 'text-gray-400'}`}>#{i + 1}</span>
                <span className="text-white font-medium">{p.name}</span>
              </div>
              <span className="text-xl font-bold text-white">{p.totalScore} pts</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scores */}
      <div className="flex items-center justify-center gap-4 flex-wrap">
        {state.players.map((p, i) => (
          <div
            key={p.id}
            className={`px-4 py-2 rounded-xl text-center ${
              i === state.currentPlayerIndex ? 'bg-primary-600/20 ring-1 ring-primary-500/30' : 'glass-light'
            }`}
          >
            <p className={`text-xs font-medium ${p.id === myId ? 'text-primary-400' : 'text-gray-400'}`}>
              {p.name} {p.id === myId ? '(You)' : ''}
            </p>
            <p className="text-lg font-bold text-white">{p.totalScore}</p>
            <p className="text-[10px] text-gray-500">Round: {p.roundScore}</p>
          </div>
        ))}
      </div>

      {/* Phase info */}
      <div className="text-center text-sm text-gray-400">
        {state.phase === 'passing' && (
          <p>Pass 3 cards {state.passDirection} &middot; Selected: {selectedPass.length}/3</p>
        )}
        {state.phase === 'playing' && (
          <p>
            Trick {state.trickNumber}/13 &middot;{' '}
            {isMyTurn ? <span className="text-primary-400 font-medium">Your turn</span> : `${state.players[state.currentPlayerIndex]?.name}'s turn`}
            {state.heartsBroken && <span className="text-red-400 ml-2">{SUIT_SYMBOLS.hearts} Broken</span>}
          </p>
        )}
      </div>

      {/* Current trick */}
      {state.phase === 'playing' && (
        <div className="flex items-center justify-center gap-3 min-h-[120px]">
          {state.currentTrick.length === 0 ? (
            <p className="text-gray-600 text-sm">Waiting for lead...</p>
          ) : (
            state.currentTrick.map((entry, i) => {
              const player = state.players.find(p => p.id === entry.playerId);
              return (
                <motion.div
                  key={i}
                  initial={{ scale: 0.8, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <div className="w-16 h-24 rounded-lg bg-white border border-gray-200 shadow-md flex flex-col items-center justify-center">
                    <span className={`text-2xl font-bold ${SUIT_COLORS[entry.card.suit]}`}>
                      {SUIT_SYMBOLS[entry.card.suit]}
                    </span>
                    <span className={`text-sm font-bold ${SUIT_COLORS[entry.card.suit]}`}>
                      {rankDisplay(entry.card.rank)}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">{player?.name}</p>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Pass confirm button */}
      {state.phase === 'passing' && selectedPass.length === 3 && (
        <div className="text-center">
          <button
            onClick={confirmPass}
            className="px-6 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors cursor-pointer"
          >
            Confirm Pass
          </button>
        </div>
      )}

      {/* My hand */}
      {myPlayer && (
        <div className="flex flex-wrap items-end justify-center gap-1 sm:gap-2 min-h-[140px] pb-4">
          {myPlayer.hand.map((card, i) => {
            const isSelectedForPass = selectedPass.some(c => cardEquals(c, card));
            const canPlay = state.phase === 'playing' && isMyTurn && isValidPlay(state, myIndex, card);
            const isPassing = state.phase === 'passing';

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
                disabled={!isPassing && !canPlay}
                className={`playing-card w-14 h-20 sm:w-16 sm:h-24 rounded-lg bg-white border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  isSelectedForPass
                    ? 'selected border-primary-400 -translate-y-4'
                    : canPlay
                    ? 'border-gray-200 hover:border-primary-300 hover:-translate-y-2'
                    : isPassing
                    ? 'border-gray-200 hover:border-gray-300'
                    : 'border-gray-300 opacity-50 cursor-not-allowed'
                }`}
              >
                <span className={`text-lg sm:text-xl font-bold ${SUIT_COLORS[card.suit]}`}>
                  {SUIT_SYMBOLS[card.suit]}
                </span>
                <span className={`text-xs sm:text-sm font-bold ${SUIT_COLORS[card.suit]}`}>
                  {rankDisplay(card.rank)}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
