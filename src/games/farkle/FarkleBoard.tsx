import { useEffect, useMemo, useRef, useState, type TransitionEvent } from 'react';
import { motion } from 'framer-motion';
import Dice, {
  faceOrientations,
  positiveModulo,
  getForwardRotationDelta,
  type CubeOrientation,
  type DiceValue,
} from '../../components/Dice/Dice';
import { DEFAULT_PLAYER_COLOR, PLAYER_COLOR_HEX } from '../../networking/playerColors';
import { scoreKeptDice } from './logic';
import type { FarkleState } from './types';

interface FarkleBoardProps {
  state: FarkleState;
  myId: string;
  onAction: (action: unknown) => void;
}

const DICE_COUNT = 6;

function createInitialOrientations(): CubeOrientation[] {
  return Array.from({ length: DICE_COUNT }, () => ({ x: 0, y: 0 }));
}

export default function FarkleBoard({ state, myId, onAction }: FarkleBoardProps) {
  const [selectionState, setSelectionState] = useState<{ token: string; values: boolean[] }>({
    token: '',
    values: Array.from({ length: DICE_COUNT }, () => false),
  });
  const [isRolling, setIsRolling] = useState(false);
  const [orientations, setOrientations] = useState<CubeOrientation[]>(() => createInitialOrientations());
  const [rollingAnchorIndex, setRollingAnchorIndex] = useState<number | null>(null);
  const prevDiceRef = useRef<number[] | null>(null);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === myId;
  const myPlayer = state.players.find((player) => player.id === myId) ?? null;
  const canBank = !!myPlayer && (myPlayer.totalScore > 0 || state.turnScore >= 500);
  const turnToken = `${state.currentPlayerIndex}:${state.phase}:${state.turnScore}:${state.dice.join(',')}:${state.kept.join(',')}`;
  const selected = selectionState.token === turnToken
    ? selectionState.values
    : Array.from({ length: DICE_COUNT }, () => false);

  const selectedIndices = useMemo(
    () => selected.map((isSelected, index) => (isSelected ? index : -1)).filter((index) => index !== -1),
    [selected]
  );

  const selectedScore = useMemo(() => {
    const selectedDice = selectedIndices.map((index) => state.dice[index]);
    return scoreKeptDice(selectedDice);
  }, [selectedIndices, state.dice]);

  const canKeep = state.phase === 'choose' && selectedIndices.length > 0 && selectedScore !== null;

  useEffect(() => {
    const prevDice = prevDiceRef.current;
    if (prevDice === null) {
      setOrientations(
        state.dice.map((value) => {
          const target = faceOrientations[(value as DiceValue) || 1];
          return { ...target };
        })
      );
      prevDiceRef.current = [...state.dice];
      return;
    }

    const diceChanged = state.dice.some((value, index) => value !== prevDice[index]);
    if (diceChanged) {
      setIsRolling(true);

      const activeIndices = state.kept
        .map((isKept, index) => (isKept ? -1 : index))
        .filter((index) => index !== -1);
      setRollingAnchorIndex(activeIndices[0] ?? null);

      setOrientations((previousOrientations) =>
        previousOrientations.map((previous, index) => {
          if (state.kept[index]) return previous;

          const targetOrientation = faceOrientations[(state.dice[index] as DiceValue) || 1];
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
        })
      );
    } else {
      setIsRolling(false);
      setRollingAnchorIndex(null);
      setOrientations(
        state.dice.map((value) => {
          const target = faceOrientations[(value as DiceValue) || 1];
          return { ...target };
        })
      );
    }

    prevDiceRef.current = [...state.dice];
  }, [state.dice, state.kept]);

  const toggleSelect = (index: number) => {
    if (!isMyTurn || state.phase !== 'choose' || state.kept[index]) return;
    setSelectionState((current) => {
      const base = current.token === turnToken
        ? current.values
        : Array.from({ length: DICE_COUNT }, () => false);
      const next = [...base];
      next[index] = !next[index];
      return { token: turnToken, values: next };
    });
  };

  const handleRollEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'transform' || !isRolling) return;
    setIsRolling(false);
    setRollingAnchorIndex(null);
  };

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Current Turn</p>
              <p className="text-lg font-semibold text-white">{currentPlayer?.name ?? 'Unknown player'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-400">Unbanked Turn Score</p>
              <p className="text-2xl font-bold text-amber-300">{state.turnScore}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-gray-400">Target Score</p>
              <p className="text-lg font-semibold text-white">{state.targetScore}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-gray-400">Scores</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {state.players.map((player) => {
              const isCurrent = player.id === currentPlayer?.id;
              const color = PLAYER_COLOR_HEX[player.color ?? DEFAULT_PLAYER_COLOR];
              return (
                <motion.div
                  key={player.id}
                  layout
                  className={`rounded-xl border px-3 py-2 ${isCurrent ? 'border-white/40 bg-white/10' : 'border-white/10 bg-black/20'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-medium text-white">{player.name}</span>
                    </div>
                    <span className="text-lg font-bold text-white">{player.totalScore}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="farkle-roll-area yahtzee-roll-area mt-auto flex flex-col items-center gap-4 pb-1">
          <div className="min-h-12 text-center">
            {state.lastEvent && <p className="text-sm text-amber-200">{state.lastEvent}</p>}
            {!!isMyTurn && myPlayer?.totalScore === 0 && state.turnScore < 500 && state.phase === 'roll-or-bank' && (
              <p className="mt-2 text-sm text-rose-300">
                You need at least 500 unbanked points in a turn before your first bank.
              </p>
            )}
          </div>

          <div className="dice-stage">
            {state.dice.map((die, index) => {
              const isKept = state.kept[index];
              const isSelected = selected[index];
              return (
                <div key={index}>
                  <Dice
                    orientation={orientations[index] ?? faceOrientations[(die as DiceValue) || 1]}
                    rolling={isRolling && !state.kept[index]}
                    held={isKept || isSelected}
                    onClick={() => toggleSelect(index)}
                    onTransitionEnd={index === rollingAnchorIndex ? handleRollEnd : undefined}
                    disabled={!isMyTurn || state.phase !== 'choose' || isKept}
                    ariaLabel={`Die ${index + 1}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onAction({ type: 'roll' })}
              disabled={!isMyTurn || (state.phase !== 'roll' && state.phase !== 'roll-or-bank')}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-40"
            >
              Roll
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: 'keep', indices: selectedIndices })}
              disabled={!isMyTurn || !canKeep}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:pointer-events-none disabled:opacity-40"
            >
              Keep Selected
              {selectedScore !== null ? ` (+${selectedScore})` : ''}
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: 'bank' })}
              disabled={!isMyTurn || state.phase !== 'roll-or-bank' || !canBank}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-40"
            >
              Bank
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
