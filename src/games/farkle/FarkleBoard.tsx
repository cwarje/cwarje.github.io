import { useEffect, useMemo, useRef, useState, type TransitionEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
const FARKLE_SCORING_REFERENCE: Array<{ combo: string; points: string }> = [
  { combo: 'Single 1', points: '100' },
  { combo: 'Single 5', points: '50' },
  { combo: 'Two 1s', points: '200' },
  { combo: 'Two 5s', points: '100' },
  { combo: 'Three 1s', points: '1000' },
  { combo: 'Three 2s', points: '200' },
  { combo: 'Three 3s', points: '300' },
  { combo: 'Three 4s', points: '400' },
  { combo: 'Three 5s', points: '500' },
  { combo: 'Three 6s', points: '600' },
  { combo: 'Four of a kind', points: '1000' },
  { combo: 'Five of a kind', points: '2000' },
  { combo: 'Six of a kind', points: '3000' },
  { combo: '1-6 straight', points: '1500' },
  { combo: 'Three pairs', points: '1500' },
  { combo: 'Two triplets', points: '2500' },
];
const FARKLE_SCORING_SPLIT_INDEX = Math.ceil(FARKLE_SCORING_REFERENCE.length / 2);
const FARKLE_SCORING_REFERENCE_COLUMNS = [
  FARKLE_SCORING_REFERENCE.slice(0, FARKLE_SCORING_SPLIT_INDEX),
  FARKLE_SCORING_REFERENCE.slice(FARKLE_SCORING_SPLIT_INDEX),
];

function createInitialOrientations(): CubeOrientation[] {
  return Array.from({ length: DICE_COUNT }, () => ({ x: 0, y: 0 }));
}

export default function FarkleBoard({ state, myId, onAction }: FarkleBoardProps) {
  const [selectionState, setSelectionState] = useState<{ token: string; values: boolean[] }>({
    token: '',
    values: Array.from({ length: DICE_COUNT }, () => false),
  });
  const [isRolling, setIsRolling] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [orientations, setOrientations] = useState<CubeOrientation[]>(() => createInitialOrientations());
  const [rollingAnchorIndex, setRollingAnchorIndex] = useState<number | null>(null);
  const prevDiceRef = useRef<number[] | null>(null);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const currentPlayerColor =
    PLAYER_COLOR_HEX[currentPlayer?.color ?? DEFAULT_PLAYER_COLOR] ?? PLAYER_COLOR_HEX[DEFAULT_PLAYER_COLOR];
  const isMyTurn = currentPlayer?.id === myId;
  const myPlayer = state.players.find((player) => player.id === myId) ?? null;
  const canBank = !!myPlayer && (myPlayer.totalScore > 0 || state.turnScore >= 500);
  const showActivePlayerHeader = state.players.length > 1;
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
  const activeDiceIndices = useMemo(
    () => state.kept.map((isKept, index) => (isKept ? -1 : index)).filter((index) => index !== -1),
    [state.kept]
  );
  const keptDiceIndices = useMemo(
    () => state.kept.map((isKept, index) => (isKept ? index : -1)).filter((index) => index !== -1),
    [state.kept]
  );

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
    <div className="farkle-board h-full w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4">
        <div className="rounded-2xl p-3 overflow-x-auto">
          <div className="mb-2 flex items-center justify-center">
            <p className="text-xs uppercase tracking-wide text-gray-300">
              Target score: <span className="font-semibold text-white">{state.targetScore}</span>
            </p>
          </div>
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {state.players.map((player) => (
                <col key={player.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-white/10">
                {state.players.map((player) => {
                  const isMe = player.id === myId;
                  const isCurrent = player.id === currentPlayer?.id;
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
                        <span className="truncate max-w-full" style={{ color: playerNameColor }}>
                          {displayName}
                        </span>
                        <span className="text-white">({player.totalScore})</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
          </table>
        </div>

        <div className="farkle-roll-area yahtzee-roll-area mt-auto flex flex-col items-center gap-4 pb-1">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
            <div className="rounded-2xl p-4 flex h-full flex-col">
              <p className="text-xs uppercase tracking-wide text-gray-400">Unbanked turn score</p>
              <div className="mt-3 flex min-h-[2.75rem] items-center">
                <p className="text-3xl font-bold" style={{ color: currentPlayerColor }}>
                  {state.turnScore}
                </p>
              </div>
            </div>
            <div className="rounded-2xl p-4 flex h-full flex-col">
              <p className="text-xs uppercase tracking-wide text-gray-400">Dice set aside</p>
              <div className="mt-3 flex min-h-[2.75rem] flex-wrap items-center gap-2 [--dice-size:2.75rem]">
                {keptDiceIndices.length > 0 ? (
                  keptDiceIndices.map((index) => (
                    <Dice
                      key={index}
                      orientation={orientations[index] ?? faceOrientations[(state.dice[index] as DiceValue) || 1]}
                      rolling={false}
                      held
                      disabled
                      ariaLabel={`Set aside die ${index + 1}`}
                    />
                  ))
                ) : (
                  <p className="text-sm text-gray-400">No dice set aside yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-12 text-center">
            {state.lastEvent && <p className="text-sm text-amber-200">{state.lastEvent}</p>}
            {!!isMyTurn && myPlayer?.totalScore === 0 && state.turnScore < 500 && state.phase === 'roll-or-bank' && (
              <p className="mt-2 text-sm text-rose-300">
                You need at least 500 unbanked points in a turn before your first bank.
              </p>
            )}
          </div>

          <div className="dice-stage">
            {activeDiceIndices.map((index) => {
              const die = state.dice[index];
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
              Set Aside
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
            <button
              type="button"
              onClick={() => setInfoOpen((open) => !open)}
              className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-500"
              aria-expanded={infoOpen}
              aria-controls="farkle-info-overlay"
            >
              Info
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setInfoOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Farkle scoring options"
            id="farkle-info-overlay"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Scoring options</h2>
                <button
                  type="button"
                  onClick={() => setInfoOpen(false)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-3">
                {FARKLE_SCORING_REFERENCE_COLUMNS.map((columnEntries, columnIndex) => (
                  <table
                    key={`overlay-scoring-column-${columnIndex}`}
                    className="w-full table-fixed border-collapse text-[13px] sm:text-[15px]"
                  >
                    <tbody>
                      {columnEntries.map((entry) => (
                        <tr key={entry.combo} className="border-b border-white/5">
                          <td className="px-2 py-1.5 text-left text-white/85">
                            {entry.combo} = {entry.points} pts
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
