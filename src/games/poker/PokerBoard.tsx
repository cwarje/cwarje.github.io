import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ChevronUp, ChevronDown } from 'lucide-react';
import type { PokerState, PokerAction, Card } from './types';

// ────────────────────────────────────────────
// Card display helpers
// ────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: 'text-red-500',
  diamonds: 'text-red-500',
  clubs: 'text-white',
  spades: 'text-white',
};

function rankLabel(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

function CardDisplay({ card, faceDown = false, size = 'md' }: { card?: Card; faceDown?: boolean; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm'
    ? 'w-10 h-14 text-xs'
    : 'w-14 h-20 text-sm';

  if (faceDown || !card) {
    return (
      <div className={`${sizeClasses} rounded-lg bg-gradient-to-br from-blue-800 to-blue-950 border border-blue-700/50 flex items-center justify-center shadow-md`}>
        <div className="w-3/4 h-3/4 rounded border border-blue-600/30 bg-blue-900/50" />
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} rounded-lg bg-gray-800 border border-white/10 flex flex-col items-center justify-center shadow-md font-bold ${SUIT_COLORS[card.suit]}`}>
      <span>{rankLabel(card.rank)}</span>
      <span className="text-xs leading-none">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}

// ────────────────────────────────────────────
// Main Board component
// ────────────────────────────────────────────

interface PokerBoardProps {
  state: PokerState;
  myId: string;
  onAction: (action: unknown) => void;
}

export default function PokerBoard({ state, myId, onAction }: PokerBoardProps) {
  const [raiseAmount, setRaiseAmount] = useState<number>(0);

  const me = state.players.find(p => p.id === myId);
  const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId && !state.gameOver;
  const currentPlayer = state.players[state.currentPlayerIndex];

  const toCall = me ? state.currentBet - me.betThisStreet : 0;
  const canCheck = toCall === 0;
  const minRaiseTotal = state.currentBet + state.minRaise;
  const maxRaiseTotal = me ? me.betThisStreet + me.chips : 0;

  // Set initial raise amount when it's my turn
  const effectiveMinRaise = Math.min(minRaiseTotal, maxRaiseTotal);

  const totalPot = state.players.reduce((sum, p) => sum + p.totalContrib, 0);

  const sendAction = (action: PokerAction) => {
    onAction(action);
  };

  const handleRaise = () => {
    const amount = Math.max(effectiveMinRaise, Math.min(raiseAmount, maxRaiseTotal));
    sendAction({ type: 'raise', amount });
  };

  // Sort players so "me" is at the bottom
  const myIndex = state.players.findIndex(p => p.id === myId);
  const orderedPlayers = myIndex >= 0
    ? [...state.players.slice(myIndex), ...state.players.slice(0, myIndex)]
    : state.players;

  return (
    <div className="space-y-6">
      {/* Pot display */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Pot</span>
          <span className="text-lg font-bold text-white">{totalPot}</span>
        </div>
        {!state.gameOver && (
          <p className="text-xs text-gray-500 mt-2">
            {state.street.charAt(0).toUpperCase() + state.street.slice(1)}
            {' \u2022 '}
            <span className="text-primary-400">{currentPlayer?.name}</span>&apos;s turn
          </p>
        )}
      </div>

      {/* Community cards */}
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3, 4].map(i => {
          const card = state.communityCards[i];
          if (!card && state.street === 'preflop') {
            return <CardDisplay key={i} faceDown size="md" />;
          }
          return card
            ? <CardDisplay key={i} card={card} size="md" />
            : <div key={i} className="w-14 h-20 rounded-lg border border-white/5 bg-white/[0.02]" />;
        })}
      </div>

      {/* Players ring */}
      <div className="space-y-2">
        {orderedPlayers.map((player) => {
          const isMe = player.id === myId;
          const isCurrent = state.players[state.currentPlayerIndex]?.id === player.id && !state.gameOver;
          const isDealer = state.players[state.dealerIndex]?.id === player.id;
          const showCards = isMe || (state.showdownReveal && !player.folded);

          return (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                isCurrent
                  ? 'border-primary-500/40 bg-primary-500/10'
                  : player.folded
                    ? 'border-white/5 bg-white/[0.02] opacity-50'
                    : 'border-white/10 bg-white/5'
              }`}
            >
              {/* Badges */}
              <div className="flex flex-col items-center gap-1 w-8">
                {isDealer && (
                  <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 rounded-full px-1.5 py-0.5">D</span>
                )}
                {player.allIn && (
                  <span className="text-[10px] font-bold bg-red-500/20 text-red-400 rounded-full px-1.5 py-0.5">AI</span>
                )}
              </div>

              {/* Name & chips */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium truncate ${isMe ? 'text-primary-300' : 'text-white'}`}>
                    {player.name}
                    {isMe && ' (you)'}
                  </span>
                  {player.folded && <span className="text-xs text-gray-500">folded</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{player.chips} chips</span>
                  {player.betThisStreet > 0 && (
                    <span className="text-xs text-amber-400">bet: {player.betThisStreet}</span>
                  )}
                </div>
              </div>

              {/* Hole cards */}
              <div className="flex gap-1">
                {player.holeCards.length > 0 ? (
                  showCards ? (
                    player.holeCards.map((c, i) => <CardDisplay key={i} card={c} size="sm" />)
                  ) : (
                    [0, 1].map(i => <CardDisplay key={i} faceDown size="sm" />)
                  )
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Winners display */}
      {state.gameOver && state.winners.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2"
        >
          <div className="flex items-center gap-2 text-yellow-400">
            <Trophy className="w-5 h-5" />
            <span className="font-bold">
              {state.winners.length === 1 ? 'Winner' : 'Winners'}
            </span>
          </div>
          {state.winners.map((w) => {
            const player = state.players.find(p => p.id === w.playerId);
            return (
              <div key={w.playerId} className="flex items-center justify-between text-sm">
                <span className="text-white font-medium">{player?.name ?? w.playerId}</span>
                <span className="text-gray-400">
                  {w.handName} &mdash; <span className="text-yellow-400 font-bold">+{w.amount}</span>
                </span>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Action buttons */}
      {isMyTurn && me && !me.folded && !me.allIn && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
        >
          {/* Top row: fold, check/call */}
          <div className="flex gap-3">
            <button
              onClick={() => sendAction({ type: 'fold' })}
              className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer font-medium"
            >
              Fold
            </button>
            {canCheck ? (
              <button
                onClick={() => sendAction({ type: 'check' })}
                className="flex-1 px-4 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors cursor-pointer"
              >
                Check
              </button>
            ) : (
              <button
                onClick={() => sendAction({ type: 'call' })}
                className="flex-1 px-4 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors cursor-pointer"
              >
                Call {Math.min(toCall, me.chips)}
              </button>
            )}
          </div>

          {/* Raise row */}
          {me.chips > toCall && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRaiseAmount(prev => Math.max(effectiveMinRaise, prev - state.bigBlind))}
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              <div className="flex-1 relative">
                <input
                  type="range"
                  min={effectiveMinRaise}
                  max={maxRaiseTotal}
                  step={state.bigBlind}
                  value={raiseAmount || effectiveMinRaise}
                  onChange={e => setRaiseAmount(Number(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="text-center text-xs text-gray-400 mt-1">
                  {raiseAmount || effectiveMinRaise}
                </div>
              </div>
              <button
                onClick={() => setRaiseAmount(prev => Math.min(maxRaiseTotal, (prev || effectiveMinRaise) + state.bigBlind))}
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronUp className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={handleRaise}
                className="px-6 py-2.5 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors cursor-pointer"
              >
                Raise
              </button>
            </div>
          )}

          {/* All-in shortcut */}
          {me.chips > 0 && (
            <button
              onClick={() => sendAction({ type: 'raise', amount: me.betThisStreet + me.chips })}
              className="w-full px-4 py-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-sm font-medium"
            >
              All In ({me.chips})
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
