import { useCallback, useEffect, useMemo, useRef, useState, type TransitionEvent } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw } from 'lucide-react';
import {
  Dice,
  faceOrientations,
  getForwardRotationDelta,
  positiveModulo,
  type CubeOrientation,
  type DiceValue,
} from '../../components/Dice';
import { PLAYER_COLOR_HEX } from '../../networking/playerColors';
import { buildMoveAnimations, shouldHideChecker, type CheckerMoveAnimation } from './animations';
import { getLegalMovesForUi } from './logic';
import {
  barLayout,
  bearOffTray,
  boardViewBox,
  checkerStackOffset,
  defaultPointLayouts,
  pointTrianglePath,
  topStackIndex,
  type PointLayout,
} from './layout';
import type { BackgammonAction, BackgammonState, MoveFrom, MoveTo, Side } from './types';
import { currentSide } from './types';

interface BackgammonBoardProps {
  state: unknown;
  myId: string;
  onAction: (action: unknown) => void;
  isHost?: boolean;
}

function signedCount(points: number[], index: number, side: Side): number {
  const v = points[index] ?? 0;
  return side === 'white' ? Math.max(0, v) : Math.max(0, -v);
}

function layoutForPoint(logicalIndex: number, mySide: Side): PointLayout {
  const lookupIndex = mySide === 'white' ? logicalIndex : 23 - logicalIndex;
  const base = defaultPointLayouts().find((p) => p.index === lookupIndex);
  if (!base) throw new Error(`Missing layout for point ${logicalIndex}`);
  return base;
}

function moveKey(from: MoveFrom, to: MoveTo): string {
  return `${from}->${to}`;
}

function createNeutralOrientations(): [CubeOrientation, CubeOrientation] {
  const o = faceOrientations[1];
  return [{ ...o }, { ...o }];
}

function spinTowardFace(previous: CubeOrientation, target: CubeOrientation): CubeOrientation {
  const xSpins = (Math.floor(Math.random() * 2) + 2) * 360;
  const ySpins = (Math.floor(Math.random() * 2) + 3) * 360;
  return {
    x:
      previous.x +
      xSpins +
      getForwardRotationDelta(positiveModulo(previous.x, 360), positiveModulo(target.x, 360)),
    y:
      previous.y +
      ySpins +
      getForwardRotationDelta(positiveModulo(previous.y, 360), positiveModulo(target.y, 360)),
  };
}

function BackgammonRollArea({
  dice,
  showRollButton,
  onRoll,
  movesRemaining,
  showEndTurn,
  onEndTurn,
  showClearSelection,
  onClearSelection,
  onRollingChange,
}: {
  dice: { d1: number; d2: number } | null;
  showRollButton: boolean;
  onRoll: () => void;
  movesRemaining: number[];
  showEndTurn: boolean;
  onEndTurn: () => void;
  showClearSelection: boolean;
  onClearSelection: () => void;
  onRollingChange?: (rolling: boolean) => void;
}) {
  const [isRolling, setIsRolling] = useState(false);
  const [orientations, setOrientations] = useState<[CubeOrientation, CubeOrientation]>(() =>
    createNeutralOrientations()
  );
  const prevDiceRef = useRef<{ d1: number; d2: number } | null>(null);

  // Detect new dice synchronously during render so move hints stay hidden until
  // the roll animation finishes (same idea as Yahtzee gating scores with !isRolling).
  const prevDice = prevDiceRef.current;
  const diceJustChanged =
    dice !== null &&
    (prevDice === null || prevDice.d1 !== dice.d1 || prevDice.d2 !== dice.d2);
  const awaitingRollAnimation = isRolling || diceJustChanged;

  useEffect(() => {
    if (!dice) {
      prevDiceRef.current = null;
      setIsRolling(false);
      setOrientations(createNeutralOrientations());
      return;
    }

    const d1 = dice.d1 as DiceValue;
    const d2 = dice.d2 as DiceValue;
    const prev = prevDiceRef.current;

    if (prev === null || prev.d1 !== d1 || prev.d2 !== d2) {
      setIsRolling(true);
      setOrientations((prevO) => [
        spinTowardFace(prevO[0], faceOrientations[d1]),
        spinTowardFace(prevO[1], faceOrientations[d2]),
      ]);
    }
  }, [dice]);

  useEffect(() => {
    onRollingChange?.(awaitingRollAnimation);
  }, [awaitingRollAnimation, onRollingChange]);

  const handleRollEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'transform' || !isRolling || !dice) return;
    prevDiceRef.current = { d1: dice.d1, d2: dice.d2 };
    setIsRolling(false);
  };

  const handleRollClick = () => {
    if (awaitingRollAnimation) return;
    setIsRolling(true);
    onRoll();
  };

  const hasSecondaryActions = showEndTurn;

  return (
    <>
      {hasSecondaryActions && (
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onEndTurn}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-500"
          >
            End turn
          </button>
        </div>
      )}

      <div className="dice-stage">
        {dice && (
          <>
            <Dice
              orientation={orientations[0]}
              rolling={awaitingRollAnimation}
              disabled
              onTransitionEnd={handleRollEnd}
              ariaLabel={`Die ${dice.d1}`}
            />
            <Dice
              orientation={orientations[1]}
              rolling={awaitingRollAnimation}
              disabled
              ariaLabel={`Die ${dice.d2}`}
            />
          </>
        )}
      </div>

      <div className="yahtzee-controls-slot min-h-12 flex w-full items-center justify-center">
        {showRollButton ? (
          <button
            type="button"
            onClick={handleRollClick}
            disabled={awaitingRollAnimation}
            className="yahtzee-roll-button flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer bg-primary-600 hover:bg-primary-500"
          >
            <RotateCcw className={`w-4 h-4 ${awaitingRollAnimation ? 'animate-spin' : ''}`} />
            {awaitingRollAnimation ? 'Rolling...' : 'Roll dice'}
          </button>
        ) : dice && movesRemaining.length > 0 && !awaitingRollAnimation ? (
          <div className="backgammon-moveControls flex min-h-12 w-full max-w-[var(--dice-stage-width)] flex-nowrap items-center justify-center gap-2">
            {showClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="yahtzee-roll-button flex min-h-12 w-auto shrink-0 items-center rounded-xl bg-primary-600 px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-500"
              >
                Clear selection
              </button>
            )}
            <p className="backgammon-movesLeft yahtzee-roll-button m-0 flex min-h-12 w-auto shrink-0 items-center justify-center px-4 py-3 text-sm font-medium">
              Pips left: {movesRemaining.join(', ')}
            </p>
          </div>
        ) : showClearSelection ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="yahtzee-roll-button flex min-h-12 items-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            Clear selection
          </button>
        ) : (
          <div aria-hidden className="h-12" />
        )}
      </div>
    </>
  );
}

const MotionCircle = motion.circle;

function AnimatedChecker({
  animation,
  onComplete,
}: {
  animation: CheckerMoveAnimation;
  onComplete: (id: number) => void;
}) {
  return (
    <MotionCircle
      r={11}
      fill={animation.color}
      stroke="#1f2937"
      strokeWidth={1.2}
      className="backgammon-checker backgammon-checker--animating"
      initial={{ cx: animation.from.x, cy: animation.from.y }}
      animate={{ cx: animation.to.x, cy: animation.to.y }}
      transition={{ duration: 0.42, ease: [0.33, 1, 0.68, 1] }}
      onAnimationComplete={() => onComplete(animation.id)}
    />
  );
}

export default function BackgammonBoard({ state, myId, onAction, isHost = false }: BackgammonBoardProps) {
  const s = state as BackgammonState;
  const myPlayer = s.players.find((p) => p.id === myId);
  const mySide: Side = myPlayer?.side ?? 'white';
  const current = s.players[s.currentPlayerIndex];
  const isMyTurn = current?.id === myId;
  const turnSide = currentSide(s);

  const [selectedFrom, setSelectedFrom] = useState<MoveFrom | null>(null);
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [animations, setAnimations] = useState<CheckerMoveAnimation[]>([]);
  const animIdRef = useRef(0);
  const lastMoveKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isMyTurn || s.phase !== 'moving') {
      setSelectedFrom(null);
    }
  }, [isMyTurn, s.phase, s.currentPlayerIndex]);

  useEffect(() => {
    if (!s.lastMove) return;
    const key = JSON.stringify(s.lastMove);
    if (key === lastMoveKeyRef.current) return;
    lastMoveKeyRef.current = key;

    const movingSide = s.lastMove.side;
    const movingPlayer = s.players.find((p) => p.side === movingSide)!;
    const opponentPlayer = s.players.find((p) => p.side !== movingSide)!;
    const getLayout = (index: number) => layoutForPoint(index, mySide);

    const newAnimations = buildMoveAnimations(
      s.lastMove,
      s,
      movingSide,
      PLAYER_COLOR_HEX[movingPlayer.color],
      PLAYER_COLOR_HEX[opponentPlayer.color],
      getLayout,
      () => ++animIdRef.current
    );
    setAnimations((prev) => [...prev, ...newAnimations]);
  }, [s.lastMove, s, mySide]);

  const removeAnimation = useCallback((id: number) => {
    setAnimations((prev) => prev.filter((anim) => anim.id !== id));
  }, []);

  const legalMoves = useMemo(
    () => (isMyTurn && s.phase === 'moving' ? getLegalMovesForUi(s, myId) : []),
    [s, myId, isMyTurn]
  );

  const moveHints = useMemo(
    () => (isDiceRolling ? [] : legalMoves),
    [legalMoves, isDiceRolling]
  );

  const destinationsForSelected = useMemo(() => {
    if (selectedFrom == null) return new Set<string>();
    return new Set(
      moveHints.filter((m) => m.from === selectedFrom).map((m) => moveKey(m.from, m.to))
    );
  }, [moveHints, selectedFrom]);

  const sourcesWithMoves = useMemo(() => {
    const set = new Set<string>();
    for (const m of moveHints) set.add(String(m.from));
    return set;
  }, [moveHints]);

  const dispatch = useCallback(
    (action: BackgammonAction) => {
      onAction(action);
    },
    [onAction]
  );

  const handlePointClick = (logicalIndex: number) => {
    if (!isMyTurn || s.phase !== 'moving' || isDiceRolling) return;

    const asDest = moveHints.find((m) => m.to === logicalIndex);
    if (selectedFrom != null && asDest && asDest.from === selectedFrom) {
      dispatch({ type: 'move', from: selectedFrom, to: logicalIndex });
      setSelectedFrom(null);
      return;
    }

    const asSource = moveHints.some((m) => m.from === logicalIndex);
    if (asSource) {
      setSelectedFrom(logicalIndex);
    }
  };

  const handleBarClick = (side: Side) => {
    if (!isMyTurn || s.phase !== 'moving' || isDiceRolling || side !== current?.side) return;
    if (sourcesWithMoves.has('bar')) setSelectedFrom('bar');
  };

  const handleBearOffClick = () => {
    if (!isMyTurn || s.phase !== 'moving' || isDiceRolling || selectedFrom == null) return;
    const move = moveHints.find((m) => m.from === selectedFrom && m.to === 'off');
    if (move) {
      dispatch({ type: 'move', from: selectedFrom, to: 'off' });
      setSelectedFrom(null);
    }
  };

  const canRoll = isMyTurn && s.phase === 'pre-roll';
  const bar = barLayout();
  const leftTray = bearOffTray('left');
  const rightTray = bearOffTray('right');
  const barHitSize = 44;
  const barHitX = bar.x + bar.width / 2 - barHitSize / 2;
  const barHitY = bar.y + bar.height / 2 - barHitSize / 2;

  const renderCheckers = (logicalIndex: number, layout: PointLayout) => {
    const whiteCount = signedCount(s.points, logicalIndex, 'white');
    const blackCount = signedCount(s.points, logicalIndex, 'black');
    const stacks: { side: Side; count: number; color: string }[] = [];
    if (whiteCount > 0) {
      stacks.push({ side: 'white', count: whiteCount, color: PLAYER_COLOR_HEX[s.players[0]!.color] });
    }
    if (blackCount > 0) {
      stacks.push({ side: 'black', count: blackCount, color: PLAYER_COLOR_HEX[s.players[1]!.color] });
    }

    return stacks.flatMap(({ side, count, color }) =>
      Array.from({ length: Math.min(count, 5) }, (_, i) => {
        const off = checkerStackOffset(i, layout.pointsDown);
        const showMore = count > 5 && i === 4;
        const isTopChecker = i === topStackIndex(count);
        const isSelected =
          isTopChecker &&
          side === turnSide &&
          selectedFrom === logicalIndex &&
          isMyTurn &&
          s.phase === 'moving';
        const hidden = shouldHideChecker(animations, 'point', side, i, logicalIndex);

        if (hidden) return null;

        return (
          <circle
            key={`${logicalIndex}-${side}-${i}`}
            cx={layout.stackX + off.dx}
            cy={layout.stackY + off.dy}
            r={11}
            fill={color}
            stroke="#1f2937"
            strokeWidth={1.2}
            className={`backgammon-checker${isSelected ? ' backgammon-checker--selected' : ''}`}
          >
            {showMore && (
              <title>{count} checkers</title>
            )}
          </circle>
        );
      })
    );
  };

  const renderPoint = (logicalIndex: number) => {
    const layout = layoutForPoint(logicalIndex, mySide);
    const isSource = sourcesWithMoves.has(String(logicalIndex));
    const isSelected = selectedFrom === logicalIndex;
    const isDest = destinationsForSelected.has(moveKey(selectedFrom ?? -1, logicalIndex));
    const altColor = logicalIndex % 2 === 0;

    return (
      <g key={logicalIndex}>
        <path
          d={pointTrianglePath(layout)}
          className={`backgammon-point ${altColor ? 'backgammon-point--dark' : 'backgammon-point--light'} ${
            isSelected ? 'backgammon-point--selected' : ''
          } ${isDest ? 'backgammon-point--dest' : ''}`}
          onClick={() => handlePointClick(logicalIndex)}
        />
        {isSource && !isSelected && (
          <path d={pointTrianglePath(layout)} className="backgammon-point--hint" onClick={() => handlePointClick(logicalIndex)} />
        )}
        {renderCheckers(logicalIndex, layout)}
        <text
          x={layout.apexX}
          y={layout.apexY + (layout.pointsDown ? 14 : -8)}
          textAnchor="middle"
          className="backgammon-pointLabel"
        >
          {logicalIndex + 1}
        </text>
      </g>
    );
  };

  const renderBarCheckers = (side: Side, count: number, xOffset: number) => {
    if (count === 0) return null;
    const color = PLAYER_COLOR_HEX[s.players[side === 'white' ? 0 : 1]!.color];
    return Array.from({ length: Math.min(count, 3) }, (_, i) => {
      const isTopChecker = i === Math.max(0, Math.min(count, 3) - 1);
      const isSelected =
        isTopChecker &&
        side === turnSide &&
        selectedFrom === 'bar' &&
        isMyTurn &&
        s.phase === 'moving';
      const hidden = shouldHideChecker(animations, 'bar', side, i);

      if (hidden) return null;

      return (
        <circle
          key={`bar-${side}-${i}`}
          cx={bar.x + bar.width / 2 + xOffset}
          cy={bar.y + bar.height / 2 + i * 14 - 14}
          r={10}
          fill={color}
          stroke="#1f2937"
          strokeWidth={1.2}
          className={`backgammon-checker${isSelected ? ' backgammon-checker--selected' : ''}`}
        />
      );
    });
  };

  const diceValues = s.dice ? { d1: s.dice[0], d2: s.dice[1] } : null;
  const bearOffHighlight =
    selectedFrom != null && destinationsForSelected.has(moveKey(selectedFrom, 'off'));

  if (s.phase === 'finished') {
    const winnerIds = s.winnerIds ?? [];
    const gameWinners = s.players.filter((p) => winnerIds.includes(p.id));
    const seriesWinners = s.seriesWinnerIds
      ? s.players.filter((p) => s.seriesWinnerIds!.includes(p.id))
      : [];
    const isSeriesComplete = s.seriesOver;
    const isMatchFormat = s.matchFormat === 'best-of-3';

    const winnerLabelFor = (winners: typeof s.players) =>
      winners.length === 0
        ? null
        : winners.some((p) => p.id === myId)
          ? 'You win!'
          : winners.length === 1
            ? `${winners[0].name} wins!`
            : `${winners.map((p) => p.name).join(', ')} win!`;

    const gameWinnerLabel = winnerLabelFor(gameWinners);
    const seriesWinnerLabel = winnerLabelFor(seriesWinners);
    const headlineLabel = isSeriesComplete ? seriesWinnerLabel : gameWinnerLabel;

    const offCount = (player: (typeof s.players)[number]) =>
      player.side === 'white' ? s.off.white : s.off.black;

    const matchWinCount = (player: (typeof s.players)[number]) => s.matchWins[player.id] ?? 0;

    const sortedPlayers = [...s.players].sort((a, b) => {
      if (isMatchFormat) return matchWinCount(b) - matchWinCount(a);
      return offCount(b) - offCount(a);
    });

    const showTrophy = isSeriesComplete;
    const endTitle = isMatchFormat && isSeriesComplete ? 'Match Over' : 'Game Over';

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="backgammon-board h-full flex flex-col items-center justify-center space-y-6 text-center"
      >
        {showTrophy && (
          <span className="text-7xl block mx-auto" aria-hidden>
            🏆
          </span>
        )}
        <h2 className="text-3xl font-extrabold text-white">{endTitle}</h2>
        {headlineLabel && <p className="text-xl text-white/90">{headlineLabel}</p>}
        {isMatchFormat && (
          <p className="text-sm text-white/70">
            Match score · first to {s.winsNeeded} wins
          </p>
        )}
        <div className="space-y-3 w-full max-w-md px-4">
          {sortedPlayers.map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center justify-between gap-4 px-5 py-3 rounded-xl ${
                i === 0 && (isSeriesComplete || !isMatchFormat)
                  ? 'bg-amber-500/10 border border-amber-500/20'
                  : 'glass-light'
              }`}
            >
              <div className="flex items-center gap-3 text-left">
                {(isSeriesComplete || !isMatchFormat) && (
                  <span
                    className={`text-lg font-bold ${i === 0 ? 'text-amber-400' : 'text-white/60'}`}
                  >
                    #{i + 1}
                  </span>
                )}
                <span className="text-white font-medium">{player.name}</span>
              </div>
              <span className="text-xl font-bold text-white text-right">
                {isMatchFormat
                  ? `${matchWinCount(player)} won`
                  : `${offCount(player)} off`}
              </span>
            </div>
          ))}
        </div>
        {!isSeriesComplete && isMatchFormat && (
          <div className="w-full max-w-md px-4">
            {isHost ? (
              <button
                type="button"
                onClick={() => onAction({ type: 'start-next-game' })}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-amber-700 text-white font-bold text-lg hover:bg-amber-600 cursor-pointer"
              >
                <Play className="w-5 h-5" />
                Next Game
              </button>
            ) : (
              <p className="text-sm text-white/70">Waiting for host to start the next game...</p>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="backgammon-board h-full flex flex-col">
      <div className="backgammon-boardArea flex-1 min-h-0 flex items-center justify-center">
        <svg
          viewBox={boardViewBox()}
          className="backgammon-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Backgammon board"
        >
          <rect x={0} y={0} width={400} height={520} className="backgammon-frame" rx={8} />
          <rect x={leftTray.x} y={leftTray.y} width={leftTray.width} height={leftTray.height} className="backgammon-tray" />
          <rect x={rightTray.x} y={rightTray.y} width={rightTray.width} height={rightTray.height} className="backgammon-tray" />

          {Array.from({ length: 24 }, (_, i) => renderPoint(i))}

          <g onClick={() => handleBarClick(current?.side ?? 'white')}>
            <rect
              x={barHitX}
              y={barHitY}
              width={barHitSize}
              height={barHitSize}
              fill="transparent"
              className="backgammon-barHit"
            />
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              className={`backgammon-bar ${
                sourcesWithMoves.has('bar') ? 'backgammon-bar--active' : ''
              } ${selectedFrom === 'bar' ? 'backgammon-bar--selected' : ''}`}
              pointerEvents="none"
            />
          </g>
          {renderBarCheckers('white', s.bar.white, -6)}
          {renderBarCheckers('black', s.bar.black, 6)}

          <g
            className={`backgammon-bearOff ${bearOffHighlight ? 'backgammon-bearOff--dest' : ''}`}
            onClick={handleBearOffClick}
          >
            <rect
              x={rightTray.x}
              y={rightTray.y}
              width={rightTray.width}
              height={rightTray.height}
              rx={2}
              fill="transparent"
            />
          </g>

          <g className="backgammon-animationLayer" pointerEvents="none">
            {animations.map((animation) => (
              <AnimatedChecker key={animation.id} animation={animation} onComplete={removeAnimation} />
            ))}
          </g>
        </svg>
      </div>

      <div className="backgammon-roll-area yahtzee-roll-area mt-auto flex flex-col items-center gap-4 pb-1">
        <BackgammonRollArea
          dice={s.phase === 'moving' ? diceValues : null}
          showRollButton={canRoll}
          onRoll={() => dispatch({ type: 'roll' })}
          movesRemaining={s.movesRemaining}
          showEndTurn={isMyTurn && s.phase === 'moving' && !isDiceRolling && legalMoves.length === 0}
          onEndTurn={() => dispatch({ type: 'end-turn' })}
          showClearSelection={selectedFrom != null}
          onClearSelection={() => setSelectedFrom(null)}
          onRollingChange={setIsDiceRolling}
        />
      </div>
    </div>
  );
}
