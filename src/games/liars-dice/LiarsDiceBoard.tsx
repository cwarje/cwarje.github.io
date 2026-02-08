import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
  Trophy, Skull, Shield, CircleDot, ChevronUp, ChevronDown,
  Crosshair, Eye, AlertTriangle,
} from 'lucide-react';
import type { LiarsDiceState, Bid } from './types';

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

interface LiarsDiceBoardProps {
  state: LiarsDiceState;
  myId: string;
  onAction: (action: unknown) => void;
}

export default function LiarsDiceBoard({ state, myId, onAction }: LiarsDiceBoardProps) {
  const myPlayer = state.players.find(p => p.id === myId);
  const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isRevealing = state.phase === 'revealing' || state.phase === 'revolver';

  // Bid input state
  const [bidQty, setBidQty] = useState(1);
  const [bidFace, setBidFace] = useState(1);

  // Update minimum bid when current bid changes
  useEffect(() => {
    if (state.currentBid) {
      setBidQty(state.currentBid.quantity);
      setBidFace(state.currentBid.faceValue);
    } else {
      setBidQty(1);
      setBidFace(1);
    }
  }, [state.currentBid]);

  const canBid = state.phase === 'bidding' && isMyTurn && myPlayer?.alive;
  const canCallLiar = canBid && state.currentBid !== null;
  const canSpotOn = canBid && state.currentBid !== null;
  const mustPullTrigger =
    state.phase === 'revolver' &&
    state.roundResult &&
    state.roundResult.triggerPlayerIds.includes(myId) &&
    !state.roundResult.pulledTrigger[myId];

  const allTriggersPulled =
    state.roundResult?.triggerPlayerIds.every(id => state.roundResult!.pulledTrigger[id]) ?? false;
  const isHost = state.players[0]?.id === myId;

  // ── Game Over Screen ─────────────────────────────────────────────────────

  if (state.phase === 'gameOver') {
    const winner = state.players.find(p => p.alive);
    const eliminated = state.players.filter(p => !p.alive);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-6 text-center">
        <Trophy className="w-16 h-16 text-amber-400 mx-auto" />
        <h2 className="text-3xl font-extrabold text-white">Game Over!</h2>
        <div className="space-y-3">
          {winner && (
            <div className="flex items-center justify-between px-5 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-amber-400">#1</span>
                <span className="text-white font-medium">{winner.name}</span>
              </div>
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
          )}
          {eliminated.reverse().map((p, i) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3 rounded-xl glass-light">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-400">#{i + 2}</span>
                <span className="text-white font-medium">{p.name}</span>
              </div>
              <Skull className="w-5 h-5 text-red-400" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  const isBidValid = (qty: number, face: number): boolean => {
    if (face < 1 || face > 6 || qty < 1) return false;
    if (!state.currentBid) return true;
    if (qty > state.currentBid.quantity) return true;
    if (qty === state.currentBid.quantity && face > state.currentBid.faceValue) return true;
    return false;
  };

  const handleBid = () => {
    if (isBidValid(bidQty, bidFace)) {
      onAction({ type: 'make-bid', bid: { quantity: bidQty, faceValue: bidFace } as Bid });
    }
  };

  const handleRoll = () => {
    onAction({ type: 'roll' });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Phase indicator */}
      <div className="text-center">
        <p className="text-sm text-gray-400">
          Round {state.round} &middot;{' '}
          <span className="text-emerald-400 font-medium capitalize">
            {state.phase === 'bidding' && isMyTurn ? "Your turn to bid" :
             state.phase === 'bidding' ? `${currentPlayer?.name}'s turn` :
             state.phase === 'rolling' ? "Rolling dice..." :
             state.phase === 'revealing' ? "Revealing dice!" :
             state.phase === 'revolver' ? "Revolver time..." : state.phase}
          </span>
        </p>
      </div>

      {/* Players status bar */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state.players.map(p => {
          const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === p.id && state.phase === 'bidding';
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                !p.alive
                  ? 'bg-red-900/20 border border-red-500/20 text-red-400 opacity-60'
                  : isCurrentTurn
                  ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-300'
                  : 'glass-light text-gray-300'
              }`}
            >
              {p.alive ? (
                <Shield className="w-3.5 h-3.5" />
              ) : (
                <Skull className="w-3.5 h-3.5" />
              )}
              <span>{p.name}{p.id === myId ? ' (You)' : ''}</span>
              {p.alive && (
                <span className="flex gap-0.5 ml-1">
                  {Array.from({ length: p.revolver.chambers }).map((_, i) => (
                    <CircleDot
                      key={i}
                      className={`w-2.5 h-2.5 ${
                        i < p.revolver.currentChamber
                          ? 'text-gray-600'
                          : 'text-yellow-400'
                      }`}
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Current bid display */}
      {state.currentBid && state.phase === 'bidding' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-emerald-600/10 border border-emerald-500/20">
            <span className="text-gray-400 text-sm">Current bid:</span>
            <span className="text-2xl font-extrabold text-white">{state.currentBid.quantity}x</span>
            {(() => {
              const DIcon = DICE_ICONS[state.currentBid.faceValue - 1];
              return <DIcon className="w-8 h-8 text-emerald-400" />;
            })()}
            <span className="text-xs text-gray-500">
              by {state.players.find(p => p.id === state.lastBidderId)?.name}
            </span>
          </div>
        </motion.div>
      )}

      {/* Rolling phase */}
      {state.phase === 'rolling' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
          <p className="text-gray-400">New round! Roll the dice to begin.</p>
          {(isHost || state.players[state.roundStarterIndex]?.id === myId) && (
            <button
              onClick={handleRoll}
              className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors cursor-pointer"
            >
              Roll Dice
            </button>
          )}
        </motion.div>
      )}

      {/* My dice */}
      {myPlayer?.alive && state.phase !== 'rolling' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 text-center uppercase tracking-wider">Your Dice</p>
          <div className="flex items-center justify-center gap-3">
            {myPlayer.dice.map((value, i) => {
              const DiceIcon = DICE_ICONS[value - 1];
              return (
                <motion.div
                  key={i}
                  initial={{ rotateY: 0, scale: 0.8 }}
                  animate={{ rotateY: 360, scale: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center"
                >
                  <DiceIcon className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-300" />
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Other players' dice (hidden during bidding, revealed during reveal/revolver) */}
      {state.phase !== 'rolling' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {state.players.filter(p => p.id !== myId && p.alive).map(p => (
            <div key={p.id} className="glass rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-gray-400">{p.name}'s Dice</p>
              <div className="flex items-center gap-1.5">
                {p.dice.map((value, i) => {
                  if (isRevealing) {
                    const DiceIcon = DICE_ICONS[value - 1];
                    return (
                      <motion.div
                        key={i}
                        initial={{ rotateY: 0 }}
                        animate={{ rotateY: 360 }}
                        transition={{ duration: 0.5, delay: i * 0.08 }}
                        className="w-9 h-9 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center"
                      >
                        <DiceIcon className="w-5 h-5 text-white" />
                      </motion.div>
                    );
                  }
                  return (
                    <div
                      key={i}
                      className="w-9 h-9 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center"
                    >
                      <span className="text-gray-600 text-lg font-bold">?</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Round result banner */}
      <AnimatePresence>
        {state.roundResult && isRevealing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-bold text-white">
                {state.roundResult.challengeType === 'liar' ? 'Liar Called!' : 'Spot On Called!'}
              </h3>
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm text-gray-300">
                <span className="text-white font-medium">
                  {state.players.find(p => p.id === state.roundResult!.challengerId)?.name}
                </span>
                {' '}called{' '}
                {state.roundResult.challengeType === 'liar' ? (
                  <>
                    <span className="text-red-400 font-bold">LIAR</span> on{' '}
                    <span className="text-white font-medium">
                      {state.players.find(p => p.id === state.roundResult!.bidderId)?.name}
                    </span>
                  </>
                ) : (
                  <span className="text-emerald-400 font-bold">SPOT ON</span>
                )}
              </p>
              <p className="text-sm text-gray-400">
                Bid: <span className="text-white font-bold">{state.roundResult.bid.quantity}x</span>{' '}
                {(() => {
                  const DIcon = DICE_ICONS[state.roundResult.bid.faceValue - 1];
                  return <DIcon className="w-4 h-4 inline text-emerald-400" />;
                })()}
                {' '}&middot; Actual count:{' '}
                <span className={`font-bold ${
                  state.roundResult.actualCount >= state.roundResult.bid.quantity
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}>
                  {state.roundResult.actualCount}
                </span>
              </p>
            </div>

            {/* Show who must pull trigger */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {state.roundResult.triggerPlayerIds.map(pid => {
                const player = state.players.find(p => p.id === pid);
                const result = state.roundResult!.revolverResults[pid];
                return (
                  <div
                    key={pid}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                      result === 'eliminated'
                        ? 'bg-red-500/20 border border-red-500/30 text-red-300'
                        : result === 'survived'
                        ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>{player?.name}</span>
                    {result === 'eliminated' && <Skull className="w-3.5 h-3.5 text-red-400" />}
                    {result === 'survived' && <Shield className="w-3.5 h-3.5 text-emerald-400" />}
                    {!result && <span className="text-xs text-amber-400">must pull trigger</span>}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Revolver / Pull Trigger UI */}
      {mustPullTrigger && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <RevolverDisplay
            chambers={myPlayer!.revolver.chambers}
            currentChamber={myPlayer!.revolver.currentChamber}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onAction({ type: 'pull-trigger' })}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 text-white font-bold text-lg hover:from-red-500 hover:to-red-400 transition-all shadow-lg shadow-red-600/30 cursor-pointer revolver-pull"
          >
            <span className="flex items-center gap-2">
              <Crosshair className="w-5 h-5" />
              Pull the Trigger
            </span>
          </motion.button>
        </motion.div>
      )}

      {/* Next Round button (host only, after all triggers pulled) */}
      {state.phase === 'revolver' && allTriggersPulled && isHost && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <button
            onClick={() => onAction({ type: 'next-round' })}
            className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors cursor-pointer"
          >
            Next Round
          </button>
        </motion.div>
      )}

      {/* Revealing phase auto-advance for host */}
      {state.phase === 'revealing' && isHost && (
        <RevealAutoAdvance onAction={onAction} />
      )}

      {/* Bidding Controls */}
      {canBid && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 space-y-4"
        >
          <h3 className="text-sm font-bold text-white text-center">Make Your Move</h3>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Quantity selector */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBidQty(q => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                <span className="text-2xl font-extrabold text-white w-10 text-center">{bidQty}</span>
                <button
                  onClick={() => setBidQty(q => q + 1)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            <span className="text-gray-600 text-xl font-bold">&times;</span>

            {/* Face value selector */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">Face Value</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6].map(face => {
                  const DIcon = DICE_ICONS[face - 1];
                  return (
                    <button
                      key={face}
                      onClick={() => setBidFace(face)}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                        bidFace === face
                          ? 'bg-emerald-600/30 border-2 border-emerald-400 shadow-lg shadow-emerald-600/20'
                          : 'bg-white/5 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <DIcon className={`w-6 h-6 ${bidFace === face ? 'text-emerald-300' : 'text-gray-400'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleBid}
              disabled={!isBidValid(bidQty, bidFace)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Bid {bidQty}x {bidFace}
            </button>

            {canCallLiar && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onAction({ type: 'call-liar' })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600/80 text-white font-bold hover:bg-red-500 transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" />
                LIAR!
              </motion.button>
            )}

            {canSpotOn && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onAction({ type: 'spot-on' })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600/80 text-white font-bold hover:bg-amber-500 transition-colors cursor-pointer"
              >
                <Crosshair className="w-4 h-4" />
                Spot On!
              </motion.button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Revolver Display Component ────────────────────────────────────────────────

function RevolverDisplay({ chambers, currentChamber }: { chambers: number; currentChamber: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-red-400 uppercase tracking-wider font-bold">Revolver</p>
      <div className="relative w-28 h-28">
        {/* Cylinder */}
        <motion.div
          animate={{ rotate: currentChamber * (360 / chambers) }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="w-full h-full"
        >
          {Array.from({ length: chambers }).map((_, i) => {
            const angle = (i * 360) / chambers;
            const rad = (angle * Math.PI) / 180;
            const x = 50 + 35 * Math.cos(rad);
            const y = 50 + 35 * Math.sin(rad);
            const used = i < currentChamber;
            return (
              <div
                key={i}
                className={`absolute w-5 h-5 rounded-full border-2 transform -translate-x-1/2 -translate-y-1/2 transition-colors ${
                  used
                    ? 'bg-gray-700 border-gray-600'
                    : 'bg-gray-900 border-yellow-500/50 shadow-sm shadow-yellow-500/20'
                }`}
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            );
          })}
        </motion.div>
        {/* Center */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center">
          <Crosshair className="w-4 h-4 text-red-400" />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        {chambers - currentChamber} chamber{chambers - currentChamber !== 1 ? 's' : ''} remaining
      </p>
    </div>
  );
}

// ── Reveal phase auto-advance component ──────────────────────────────────────

function RevealAutoAdvance({ onAction }: { onAction: (action: unknown) => void }) {
  useEffect(() => {
    // Auto-advance from revealing to revolver after a short delay
    const timer = setTimeout(() => {
      // The host dispatches a no-op action; actual transition is handled by bot logic
      // We just need to signal the state to move forward
      onAction({ type: 'pull-trigger' }); // This will be ignored if player isn't in trigger list
    }, 2000);
    return () => clearTimeout(timer);
  }, [onAction]);

  return null;
}
