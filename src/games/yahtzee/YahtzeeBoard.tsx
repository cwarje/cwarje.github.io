import { useState, useEffect, useRef, type TransitionEvent } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import type { YahtzeeState, ScoreCategory } from './types';
import {
  calculateScoreWithJoker,
  getAvailableCategories,
  getUpperTotal,
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
import { DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX } from '../../networking/playerColors';

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
  const myPlayer = state.players.find(p => p.id === myId);
  const hasRolled = state.rollsLeft < 3;

  const [isRolling, setIsRolling] = useState(false);
  const spectatorRollsLeftText =
    !isMyTurn && state.rollsLeft > 0 && state.rollsLeft < 3
      ? `${state.rollsLeft} roll${state.rollsLeft === 1 ? '' : 's'} left`
      : '';
  const [orientations, setOrientations] = useState<CubeOrientation[]>(() => createInitialOrientations());
  const [rollingAnchorIndex, setRollingAnchorIndex] = useState<number | null>(null);
  const [hasPendingYahtzeeCelebration, setHasPendingYahtzeeCelebration] = useState(false);
  const [isYahtzeeCelebrationVisible, setIsYahtzeeCelebrationVisible] = useState(false);
  const prevStateRef = useRef({ playerIndex: state.currentPlayerIndex, rollsLeft: state.rollsLeft });
  const prevDiceRef = useRef<number[]>([...state.dice]);
  const showCelebrationTestButton = import.meta.env.DEV;

  useEffect(() => {
    const prev = prevStateRef.current;
    const rollHappened =
      prev.playerIndex === state.currentPlayerIndex && state.rollsLeft < prev.rollsLeft;
    prevStateRef.current = { playerIndex: state.currentPlayerIndex, rollsLeft: state.rollsLeft };

    if (rollHappened) {
      setIsRolling(true);

      const heldSnapshot = [...state.held];
      const finalDice = state.dice as DiceValue[];
      const diceChanged = finalDice.some((value, index) => value !== prevDiceRef.current[index]);
      const isYahtzeeRoll = diceChanged && new Set(finalDice).size === 1;
      setHasPendingYahtzeeCelebration(isYahtzeeRoll);
      if (!isYahtzeeRoll) {
        setIsYahtzeeCelebrationVisible(false);
      }

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
      setHasPendingYahtzeeCelebration(false);
      setIsYahtzeeCelebrationVisible(false);
      setOrientations(
        state.dice.map((v) => {
          const fo = faceOrientations[v as DiceValue];
          return { ...fo };
        }),
      );
    }
    prevDiceRef.current = [...state.dice];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayerIndex, state.rollsLeft]);

  const handleRollEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'transform' || !isRolling) return;
    if (hasPendingYahtzeeCelebration) {
      setIsYahtzeeCelebrationVisible(true);
    }
    setHasPendingYahtzeeCelebration(false);
    setIsRolling(false);
    setRollingAnchorIndex(null);
  };

  const myAvailableCategories =
    myPlayer && hasRolled && isMyTurn && !isRolling
      ? getAvailableCategories(state.dice, myPlayer.scorecard)
      : [];

  const handleRoll = () => {
    if (isMyTurn && state.rollsLeft > 0 && !isRolling) {
      setIsRolling(true);
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
      setHasPendingYahtzeeCelebration(false);
      setIsYahtzeeCelebrationVisible(false);
      onAction({ type: 'score', category });
    }
  };

  const handleTestCelebration = () => {
    setHasPendingYahtzeeCelebration(false);
    setIsYahtzeeCelebrationVisible(true);
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
        <span className="text-7xl block mx-auto" aria-hidden>🏆</span>
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
    const yahtzeeBonus = category === 'yahtzee' ? (state.yahtzeeBonus[playerId] || 0) * 100 : 0;
    const displayValue = scored !== null ? scored + yahtzeeBonus : potential;
    const displayText = displayValue === null ? '\u00A0' : String(displayValue);

    return (
      <td
        key={playerId}
        onClick={() => canScore && handleScore(category)}
        className={`py-1.5 px-2 text-center text-[13px] sm:text-[15px] transition-colors ${
          scored !== null
            ? 'bg-green-600/25 text-white'
            : canScore
            ? 'text-primary-400 cursor-pointer hover:bg-primary-600/20 active:bg-primary-600/30'
            : 'text-white/30'
        } ${isCurrent && scored === null ? 'bg-white/[0.03]' : ''}`}
      >
        <span className="inline-block w-[3ch] text-center" aria-hidden={displayValue === null}>
          {displayText}
        </span>
      </td>
    );
  };

  const showActivePlayerHeader = state.players.length > 1;

  return (
    <div className="yahtzee-board relative h-full flex flex-col space-y-4 sm:space-y-5">
      {showCelebrationTestButton && (
        <button
          type="button"
          onClick={handleTestCelebration}
          className="absolute right-3 top-3 z-20 rounded-md border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors cursor-pointer"
        >
          Test Yahtzee FX
        </button>
      )}
      {/* Score Table (at the top) */}
      <div className="p-3 overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[13px] sm:text-[15px]">
          <colgroup>
            <col className="w-[132px] sm:w-[200px]" />
            {state.players.map((player) => (
              <col key={player.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-2" />
              {state.players.map((player) => {
                const isMe = player.id === myId;
                const isCurrent = state.players[state.currentPlayerIndex]?.id === player.id;
                const activeHeaderClass =
                  isCurrent && showActivePlayerHeader
                    ? isMe
                      ? 'yahtzee-playerHeader--activeSelf font-semibold'
                      : 'yahtzee-playerHeader--activeOther font-semibold'
                    : '';
                const displayName = isMe ? 'You' : player.name;
                const playerNameColor =
                  PLAYER_COLOR_HEX[player.color] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
                return (
                  <th
                    key={player.id}
                    className={`yahtzee-playerHeader py-2 px-2 text-center font-medium ${activeHeaderClass}`}
                  >
                    <div className="flex min-w-0 items-center justify-center gap-1 whitespace-nowrap">
                      <span
                        className="truncate max-w-full"
                        style={{ color: playerNameColor }}
                      >
                        {displayName}
                      </span>
                      <span className="text-white">({player.totalScore})</span>
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
                    className={`py-1.5 px-2 text-center font-bold text-[13px] sm:text-[15px] ${
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

          </tbody>
        </table>
      </div>

      {/* Dice + Roll Button */}
      <div className="yahtzee-roll-area flex flex-col items-center gap-4">
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
                golden={isYahtzeeCelebrationVisible}
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
            className={`yahtzee-roll-button flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ${
              isYahtzeeCelebrationVisible
                ? 'yahtzee-roll-button--gold'
                : 'bg-primary-600 hover:bg-primary-500'
            }`}
          >
            <RotateCcw className={`w-4 h-4 ${isRolling ? 'animate-spin' : ''}`} />
            {isRolling
              ? 'Rolling...'
              : isYahtzeeCelebrationVisible
              ? 'YAHTZEE!!!'
              : `Roll ${hasRolled ? `(${state.rollsLeft} left)` : ''}`}
          </button>
        )}
        {!isMyTurn && spectatorRollsLeftText && (
          <div className="min-h-12 px-6 py-3 text-white font-medium flex items-center justify-center">
            {spectatorRollsLeftText}
          </div>
        )}
      </div>
    </div>
  );
}
