import { useState, useEffect, useRef, type TransitionEvent } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Trophy } from 'lucide-react';
import type { YahtzeeState, ScoreCategory } from './types';
import {
  calculateScoreWithJoker,
  getAvailableCategories,
  getUpperTotal,
  getLowerTotal,
  hasUpperBonus,
} from './logic';
import {
  Dice,
  faceOrientations,
  positiveModulo,
  getForwardRotationDelta,
  type CubeOrientation,
  type DiceValue,
} from '../../components/Dice';

const DICE_COUNT = 5;

function createInitialOrientations(): CubeOrientation[] {
  return Array.from({ length: DICE_COUNT }, () => ({ x: 0, y: 0 }));
}

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
}

export default function YahtzeeBoard({ state, myId, onAction }: YahtzeeBoardProps) {
  const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const myPlayer = state.players.find(p => p.id === myId);
  const hasRolled = state.rollsLeft < 3;

  const [isRolling, setIsRolling] = useState(false);
  const [orientations, setOrientations] = useState<CubeOrientation[]>(() => createInitialOrientations());
  const [rollingAnchorIndex, setRollingAnchorIndex] = useState<number | null>(null);
  const prevStateRef = useRef({ playerIndex: state.currentPlayerIndex, rollsLeft: state.rollsLeft });

  useEffect(() => {
    const prev = prevStateRef.current;
    const rollHappened =
      prev.playerIndex === state.currentPlayerIndex && state.rollsLeft < prev.rollsLeft;
    prevStateRef.current = { playerIndex: state.currentPlayerIndex, rollsLeft: state.rollsLeft };

    if (rollHappened) {
      setIsRolling(true);

      const heldSnapshot = [...state.held];
      const finalDice = state.dice as DiceValue[];

      const activeIndices = heldSnapshot
        .map((h, i) => (h ? -1 : i))
        .filter((i) => i !== -1);

      setRollingAnchorIndex(activeIndices[0] ?? null);

      setOrientations((prev) =>
        prev.map((previous, index) => {
          if (heldSnapshot[index]) return previous;

          const targetOrientation = faceOrientations[finalDice[index]];
          const xSpins = (Math.floor(Math.random() * 2) + 2) * 360;
          const ySpins = (Math.floor(Math.random() * 2) + 3) * 360;

          return {
            x:
              previous.x +
              xSpins +
              getForwardRotationDelta(
                positiveModulo(previous.x, 360),
                positiveModulo(targetOrientation.x, 360),
              ),
            y:
              previous.y +
              ySpins +
              getForwardRotationDelta(
                positiveModulo(previous.y, 360),
                positiveModulo(targetOrientation.y, 360),
              ),
          };
        }),
      );
    } else {
      setIsRolling(false);
      setRollingAnchorIndex(null);
      setOrientations(
        state.dice.map((v) => {
          const fo = faceOrientations[v as DiceValue];
          return { ...fo };
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayerIndex, state.rollsLeft]);

  const handleRollEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'transform' || !isRolling) return;
    setIsRolling(false);
    setRollingAnchorIndex(null);
  };

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
        className="yahtzee-board h-full flex flex-col items-center justify-center space-y-6 text-center"
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
    <div className="yahtzee-board h-full flex flex-col space-y-4 sm:space-y-5">
      {/* Score Table (at the top) */}
      <div className="p-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-2 max-w-[300px]" />
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
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Upper Section */}
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

            {/* Spacer */}
            <tr>
              <td colSpan={1 + state.players.length} className="py-1" />
            </tr>

            {/* Lower Section */}
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

            {/* Grand Total */}
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

      {/* Dice + Roll Button */}
      <div className="flex flex-col items-center gap-4">
        <div className="dice-stage">
          {orientations.map((orientation, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Dice
                orientation={orientation}
                rolling={isRolling && !state.held[i]}
                held={state.held[i]}
                onClick={() => handleToggleHold(i)}
                onTransitionEnd={i === rollingAnchorIndex ? handleRollEnd : undefined}
                disabled={!isMyTurn || !hasRolled || state.rollsLeft === 0 || isRolling}
                ariaLabel={`Die ${i + 1}: ${state.held[i] ? 'held' : 'active'}`}
                className={!isMyTurn || !hasRolled ? 'opacity-60' : ''}
              />
            </motion.div>
          ))}
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
