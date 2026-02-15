import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, RotateCcw, Trophy } from 'lucide-react';
import type { YahtzeeState, ScoreCategory } from './types';
import {
  calculateScoreWithJoker,
  getAvailableCategories,
  getUpperTotal,
  getLowerTotal,
  hasUpperBonus,
} from './logic';
import LeaveButton from '../../components/LeaveButton';

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const UPPER_CATEGORIES: { key: ScoreCategory; label: string }[] = [
  { key: 'ones', label: 'Ones' },
  { key: 'twos', label: 'Twos' },
  { key: 'threes', label: 'Threes' },
  { key: 'fours', label: 'Fours' },
  { key: 'fives', label: 'Fives' },
  { key: 'sixes', label: 'Sixes' },
];

const LOWER_CATEGORIES: { key: ScoreCategory; label: string }[] = [
  { key: 'threeOfAKind', label: '3 of a Kind' },
  { key: 'fourOfAKind', label: '4 of a Kind' },
  { key: 'fullHouse', label: 'Full House' },
  { key: 'smallStraight', label: 'Sm. Straight' },
  { key: 'largeStraight', label: 'Lg. Straight' },
  { key: 'yahtzee', label: 'Yahtzee' },
  { key: 'chance', label: 'Chance' },
];

interface YahtzeeBoardProps {
  state: YahtzeeState;
  myId: string;
  onAction: (action: unknown) => void;
  roomCode: string;
}

export default function YahtzeeBoard({ state, myId, onAction, roomCode }: YahtzeeBoardProps) {
  const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const myPlayer = state.players.find(p => p.id === myId);
  const hasRolled = state.rollsLeft < 3;

  // --- Dice rolling animation state ---
  const [isRolling, setIsRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState<number[]>(state.dice);
  const [diceSettled, setDiceSettled] = useState([true, true, true, true, true]);
  const prevStateRef = useRef({ playerIndex: state.currentPlayerIndex, rollsLeft: state.rollsLeft });
  const animTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect rolls and trigger rolling animation
  useEffect(() => {
    const prev = prevStateRef.current;
    const rollHappened =
      prev.playerIndex === state.currentPlayerIndex && state.rollsLeft < prev.rollsLeft;
    prevStateRef.current = { playerIndex: state.currentPlayerIndex, rollsLeft: state.rollsLeft };

    // Cleanup previous animation
    if (intervalRef.current) clearInterval(intervalRef.current);
    animTimersRef.current.forEach((t) => clearTimeout(t));
    animTimersRef.current = [];

    if (rollHappened) {
      setIsRolling(true);
      const heldSnapshot = [...state.held];
      const finalDice = [...state.dice];

      // Track which dice have settled (mutable, shared with interval closure)
      const settledSet = new Set<number>();
      // Mark held dice as already settled
      heldSnapshot.forEach((h, i) => { if (h) settledSet.add(i); });
      setDiceSettled(heldSnapshot.map((h) => h));

      // Cycle random dice values every 80ms
      intervalRef.current = setInterval(() => {
        setDisplayDice((prev) =>
          prev.map((_, i) => {
            if (heldSnapshot[i] || settledSet.has(i)) return finalDice[i];
            return Math.floor(Math.random() * 6) + 1;
          })
        );
      }, 80);

      // Stagger settling of each unheld die
      let settleIndex = 0;
      for (let i = 0; i < 5; i++) {
        if (heldSnapshot[i]) continue;
        const settleTime = 600 + settleIndex * 110;
        settleIndex++;
        animTimersRef.current.push(
          setTimeout(() => {
            settledSet.add(i);
            setDiceSettled((prev) => {
              const next = [...prev];
              next[i] = true;
              return next;
            });
          }, settleTime)
        );
      }

      // End rolling after all dice settle
      animTimersRef.current.push(
        setTimeout(() => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setDisplayDice(finalDice);
          setIsRolling(false);
          setDiceSettled([true, true, true, true, true]);
        }, 1200)
      );
    } else {
      setDisplayDice([...state.dice]);
      setIsRolling(false);
      setDiceSettled([true, true, true, true, true]);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      animTimersRef.current.forEach((t) => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayerIndex, state.rollsLeft]);

  // Available categories for scoring (respects joker rules)
  const myAvailableCategories =
    myPlayer && hasRolled && isMyTurn && !isRolling
      ? getAvailableCategories(state.dice, myPlayer.scorecard)
      : [];

  const handleRoll = () => {
    if (isMyTurn && state.rollsLeft > 0 && !isRolling) {
      onAction({ type: 'roll' });
    }
  };

  const handleToggleHold = (index: number) => {
    if (isMyTurn && hasRolled && state.rollsLeft > 0 && !isRolling) {
      onAction({ type: 'toggle-hold', index });
    }
  };

  const handleScore = (category: ScoreCategory) => {
    if (isMyTurn && hasRolled && !isRolling && myAvailableCategories.includes(category)) {
      onAction({ type: 'score', category });
    }
  };

  // --- Game Over Screen ---
  if (state.gameOver) {
    const sorted = [...state.players].sort((a, b) => b.totalScore - a.totalScore);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-md mx-auto space-y-6 text-center"
      >
        <Trophy className="w-16 h-16 text-amber-400 mx-auto" />
        <h2 className="text-3xl font-extrabold text-white">Game Over!</h2>
        <div className="space-y-3">
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-5 py-3 rounded-xl ${
                i === 0
                  ? 'bg-amber-500/10 border border-amber-500/20'
                  : 'glass-light'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-lg font-bold ${
                    i === 0 ? 'text-amber-400' : 'text-white/60'
                  }`}
                >
                  #{i + 1}
                </span>
                <span className="text-white font-medium">{p.name}</span>
              </div>
              <span className="text-xl font-bold text-white">{p.totalScore}</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // --- Helper to render a score cell ---
  const renderScoreCell = (playerId: string, category: ScoreCategory) => {
    const player = state.players.find((p) => p.id === playerId)!;
    const isMe = playerId === myId;
    const scored = player.scorecard[category];
    const canScore =
      isMe &&
      isMyTurn &&
      hasRolled &&
      !isRolling &&
      scored === null &&
      myAvailableCategories.includes(category);
    const potential = canScore
      ? calculateScoreWithJoker(state.dice, category, player.scorecard)
      : null;
    const isCurrent = state.players[state.currentPlayerIndex]?.id === playerId;

    return (
      <td
        key={playerId}
        onClick={() => canScore && handleScore(category)}
        className={`py-1.5 px-2 text-center font-mono text-xs transition-colors ${
          scored !== null
            ? 'bg-green-600/25 text-white'
            : canScore
            ? 'text-primary-400 font-bold cursor-pointer hover:bg-primary-600/20 active:bg-primary-600/30'
            : 'text-white/30'
        } ${isCurrent && scored === null ? 'bg-white/[0.03]' : ''}`}
      >
        {(() => {
          const yahtzeeBonus = category === 'yahtzee' ? (state.yahtzeeBonus[playerId] || 0) * 100 : 0;
          if (scored !== null) return scored + yahtzeeBonus;
          if (potential !== null) return potential;
          return '-';
        })()}
      </td>
    );
  };

  return (
    <div className="space-y-5">
      {/* Score Table (at the top) */}
      <div className="glass rounded-2xl p-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-2 max-w-[300px]">
                <div className="text-white font-bold text-sm capitalize">Yahtzee</div>
                <div className="text-white/50 text-[10px] font-normal">Room: {roomCode}</div>
              </th>
              {state.players.map((player) => {
                const isMe = player.id === myId;
                const isCurrent = state.players[state.currentPlayerIndex]?.id === player.id;
                return (
                  <th
                    key={player.id}
                    className={`py-2 px-2 text-center font-medium min-w-[56px] ${
                      isCurrent
                        ? 'text-primary-400'
                        : isMe
                        ? 'text-primary-300'
                        : 'text-white'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="truncate max-w-[72px]">
                        {player.name}
                        {isMe && (
                          <span className="text-primary-500 text-[10px] ml-0.5">(You)</span>
                        )}
                      </span>
                      {isMe && <LeaveButton variant="icon" />}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* ── Upper Section ── */}
            {UPPER_CATEGORIES.map(({ key, label }) => (
              <tr key={key} className="border-b border-white/5">
                <td className="py-1.5 px-2 text-white max-w-[300px] truncate">{label}</td>
                {state.players.map((player) => renderScoreCell(player.id, key))}
              </tr>
            ))}

            {/* Upper Bonus */}
            <tr className="border-b border-white/10 bg-white/[0.03]">
              <td className="py-1.5 px-2 text-white font-medium max-w-[300px]">Bonus</td>
              {state.players.map((player) => {
                const earned = hasUpperBonus(player.scorecard);
                const upperTotal = getUpperTotal(player.scorecard);
                const remaining = Math.max(0, 63 - upperTotal);
                return (
                  <td
                    key={player.id}
                    className={`py-1.5 px-2 text-center font-mono font-bold text-xs ${
                      earned ? 'text-green-400' : 'text-white/50'
                    }`}
                  >
                    {earned ? '35' : `0 (${remaining} left)`}
                  </td>
                );
              })}
            </tr>

            {/* ── Spacer ── */}
            <tr>
              <td colSpan={1 + state.players.length} className="py-1" />
            </tr>

            {/* ── Lower Section ── */}
            {LOWER_CATEGORIES.map(({ key, label }) => (
              <tr key={key} className="border-b border-white/5">
                <td className="py-1.5 px-2 text-white max-w-[300px] truncate">{label}</td>
                {state.players.map((player) => renderScoreCell(player.id, key))}
              </tr>
            ))}

            {/* Lower Subtotal */}
            <tr className="border-b border-white/10 bg-white/[0.03]">
              <td className="py-1.5 px-2 text-white font-medium max-w-[300px]">Lower Total</td>
              {state.players.map((player) => (
                <td
                  key={player.id}
                  className="py-1.5 px-2 text-center font-mono text-white text-xs"
                >
                  {getLowerTotal(player.scorecard)}
                </td>
              ))}
            </tr>

            {/* ── Grand Total ── */}
            <tr className="border-t-2 border-white/20">
              <td className="py-2 px-2 text-white font-bold max-w-[300px]">Total</td>
              {state.players.map((player) => (
                <td
                  key={player.id}
                  className="py-2 px-2 text-center font-mono font-bold text-white text-sm"
                >
                  {player.totalScore}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Turn indicator */}
      <div className="text-center">
        <p className="text-sm text-white">
          Round {state.round}/13 &middot;{' '}
          <span className={isMyTurn ? 'text-primary-400 font-medium' : 'text-white'}>
            {isMyTurn ? 'Your turn' : `${currentPlayer?.name}'s turn`}
          </span>
        </p>
      </div>

      {/* Dice + Roll Button (below score table) */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          {displayDice.map((value, i) => {
            const DiceIcon = DICE_ICONS[value - 1];
            const isDieRolling = isRolling && !state.held[i] && !diceSettled[i];

            return (
              <motion.button
                key={i}
                animate={{
                  rotate: isDieRolling ? [-10, 10] : 0,
                  y: isDieRolling ? [-4, 4] : 0,
                  scale: !isDieRolling && diceSettled[i] ? 1 : 0.95,
                }}
                transition={
                  isDieRolling
                    ? {
                        rotate: {
                          duration: 0.1,
                          repeat: Infinity,
                          repeatType: 'reverse' as const,
                          ease: 'easeInOut',
                        },
                        y: {
                          duration: 0.12,
                          repeat: Infinity,
                          repeatType: 'reverse' as const,
                          ease: 'easeInOut',
                        },
                      }
                    : {
                        type: 'spring',
                        stiffness: 400,
                        damping: 12,
                      }
                }
                onClick={() => handleToggleHold(i)}
                disabled={!isMyTurn || !hasRolled || state.rollsLeft === 0 || isRolling}
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  state.held[i]
                    ? 'bg-primary-600/30 border-2 border-primary-400 shadow-lg shadow-primary-600/20'
                    : 'bg-white border border-white/20 hover:bg-white/90'
                } ${!isMyTurn || !hasRolled ? 'opacity-60' : ''}`}
              >
                <DiceIcon
                  className={`w-8 h-8 sm:w-10 sm:h-10 ${
                    state.held[i] ? 'text-primary-300' : 'text-slate-900'
                  }`}
                />
              </motion.button>
            );
          })}
        </div>

        {isMyTurn && (
          <button
            onClick={handleRoll}
            disabled={state.rollsLeft === 0 || isRolling}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <RotateCcw className={`w-4 h-4 ${isRolling ? 'animate-spin' : ''}`} />
            {isRolling ? 'Rolling...' : `Roll ${hasRolled ? `(${state.rollsLeft} left)` : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}
