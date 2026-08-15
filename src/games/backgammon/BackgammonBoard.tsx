import { useCallback, useEffect, useMemo, useRef, useState, type TransitionEvent } from 'react';
import {
  Dice,
  faceOrientations,
  getForwardRotationDelta,
  positiveModulo,
  type CubeOrientation,
  type DiceValue,
} from '../../components/Dice';
import { PLAYER_COLOR_HEX, getPlayerHudTextColor } from '../../networking/playerColors';
import { getLegalMovesForUi } from './logic';
import {
  barLayout,
  bearOffTray,
  boardViewBox,
  checkerStackOffset,
  defaultPointLayouts,
  pointTrianglePath,
  type PointLayout,
} from './layout';
import type { BackgammonAction, BackgammonState, MoveFrom, MoveTo, Side } from './types';

interface BackgammonBoardProps {
  state: unknown;
  myId: string;
  onAction: (action: unknown) => void;
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

function BackgammonDiceSlot({
  dice,
  showRollButton,
  onRoll,
  movesRemaining,
}: {
  dice: { d1: number; d2: number } | null;
  showRollButton: boolean;
  onRoll: () => void;
  movesRemaining: number[];
}) {
  const [isRolling, setIsRolling] = useState(false);
  const [orientations, setOrientations] = useState<[CubeOrientation, CubeOrientation]>(() =>
    createNeutralOrientations()
  );
  const prevDiceRef = useRef<{ d1: number; d2: number } | null>(null);

  useEffect(() => {
    if (!dice) {
      prevDiceRef.current = null;
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

  const handleRollEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'transform' || !isRolling || !dice) return;
    prevDiceRef.current = { d1: dice.d1, d2: dice.d2 };
    setIsRolling(false);
  };

  const handleRollClick = () => {
    if (isRolling) return;
    setIsRolling(true);
    onRoll();
  };

  return (
    <div className="backgammon-diceSlot">
      {dice && (
        <div className="backgammon-diceRow dice-stage">
          <Dice
            orientation={orientations[0]}
            rolling={isRolling}
            disabled
            size="2.75rem"
            onTransitionEnd={handleRollEnd}
            ariaLabel={`Die ${dice.d1}`}
          />
          <Dice
            orientation={orientations[1]}
            rolling={isRolling}
            disabled
            size="2.75rem"
            ariaLabel={`Die ${dice.d2}`}
          />
          {movesRemaining.length > 0 && !isRolling && (
            <span className="backgammon-movesLeft">Pips left: {movesRemaining.join(', ')}</span>
          )}
        </div>
      )}

      {showRollButton && (
        <button
          type="button"
          className="backgammon-rollBtn"
          onClick={handleRollClick}
          disabled={isRolling}
        >
          {isRolling ? 'Rolling…' : 'Roll dice'}
        </button>
      )}
    </div>
  );
}

export default function BackgammonBoard({ state, myId, onAction }: BackgammonBoardProps) {
  const s = state as BackgammonState;
  const myPlayer = s.players.find((p) => p.id === myId);
  const mySide: Side = myPlayer?.side ?? 'white';
  const myIndex = s.players.findIndex((p) => p.id === myId);
  const current = s.players[s.currentPlayerIndex];
  const isMyTurn = current?.id === myId;

  const [selectedFrom, setSelectedFrom] = useState<MoveFrom | null>(null);

  const legalMoves = useMemo(
    () => (isMyTurn && s.phase === 'moving' ? getLegalMovesForUi(s, myId) : []),
    [s, myId, isMyTurn]
  );

  const destinationsForSelected = useMemo(() => {
    if (selectedFrom == null) return new Set<string>();
    return new Set(
      legalMoves.filter((m) => m.from === selectedFrom).map((m) => moveKey(m.from, m.to))
    );
  }, [legalMoves, selectedFrom]);

  const sourcesWithMoves = useMemo(() => {
    const set = new Set<string>();
    for (const m of legalMoves) set.add(String(m.from));
    return set;
  }, [legalMoves]);

  const dispatch = useCallback(
    (action: BackgammonAction) => {
      onAction(action);
    },
    [onAction]
  );

  const handlePointClick = (logicalIndex: number) => {
    if (!isMyTurn || s.phase !== 'moving') return;

    const asDest = legalMoves.find((m) => m.to === logicalIndex);
    if (selectedFrom != null && asDest && asDest.from === selectedFrom) {
      dispatch({ type: 'move', from: selectedFrom, to: logicalIndex });
      setSelectedFrom(null);
      return;
    }

    const asSource = legalMoves.some((m) => m.from === logicalIndex);
    if (asSource) {
      setSelectedFrom(logicalIndex);
    }
  };

  const handleBarClick = (side: Side) => {
    if (!isMyTurn || s.phase !== 'moving' || side !== current?.side) return;
    if (sourcesWithMoves.has('bar')) setSelectedFrom('bar');
  };

  const handleBearOffClick = () => {
    if (!isMyTurn || s.phase !== 'moving' || selectedFrom == null) return;
    const move = legalMoves.find((m) => m.from === selectedFrom && m.to === 'off');
    if (move) {
      dispatch({ type: 'move', from: selectedFrom, to: 'off' });
      setSelectedFrom(null);
    }
  };

  const canRoll = isMyTurn && s.phase === 'pre-roll';
  const bar = barLayout();
  const leftTray = bearOffTray('left');
  const rightTray = bearOffTray('right');

  const opponent = s.players[myIndex === 0 ? 1 : 0];

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
        return (
          <circle
            key={`${logicalIndex}-${side}-${i}`}
            cx={layout.stackX + off.dx}
            cy={layout.stackY + off.dy}
            r={11}
            fill={color}
            stroke="#1f2937"
            strokeWidth={1.2}
            className="backgammon-checker"
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
    return Array.from({ length: Math.min(count, 3) }, (_, i) => (
      <circle
        key={`bar-${side}-${i}`}
        cx={bar.x + bar.width / 2 + xOffset}
        cy={bar.y + bar.height / 2 + i * 14 - 14}
        r={10}
        fill={color}
        stroke="#1f2937"
        strokeWidth={1.2}
      />
    ));
  };

  const diceValues = s.dice ? { d1: s.dice[0], d2: s.dice[1] } : null;
  const bearOffHighlight =
    selectedFrom != null && destinationsForSelected.has(moveKey(selectedFrom, 'off'));

  return (
    <div className="backgammon-boardWrap">
      <div className="backgammon-statusBar">
        <span style={{ color: getPlayerHudTextColor(myPlayer?.color ?? 'red') }}>
          You ({mySide}) · {s.off[mySide]} off
        </span>
        <span className="backgammon-statusBar-opponent">
          {opponent?.name} · {s.off[opponent?.side ?? 'black']} off
        </span>
        <span className="backgammon-statusBar-turn">
          {s.phase === 'finished'
            ? 'Game over'
            : isMyTurn
              ? s.phase === 'pre-roll'
                ? 'Your roll'
                : 'Your move'
              : `${current?.name}'s turn`}
        </span>
      </div>

      <div className="backgammon-main">
        <svg viewBox={boardViewBox()} className="backgammon-svg" role="img" aria-label="Backgammon board">
          <rect x={0} y={0} width={400} height={520} className="backgammon-frame" rx={8} />
          <rect x={leftTray.x} y={leftTray.y} width={leftTray.width} height={leftTray.height} className="backgammon-tray" />
          <rect x={rightTray.x} y={rightTray.y} width={rightTray.width} height={rightTray.height} className="backgammon-tray" />

          {Array.from({ length: 24 }, (_, i) => renderPoint(i))}

          <rect
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            className={`backgammon-bar ${sourcesWithMoves.has('bar') ? 'backgammon-bar--active' : ''}`}
            onClick={() => handleBarClick(current?.side ?? 'white')}
          />
          {renderBarCheckers('white', s.bar.white, -6)}
          {renderBarCheckers('black', s.bar.black, 6)}

          <g
            className={`backgammon-bearOff ${bearOffHighlight ? 'backgammon-bearOff--dest' : ''}`}
            onClick={handleBearOffClick}
          >
            <rect x={rightTray.x + 1} y={rightTray.y + 8} width={12} height={80} rx={2} fill="transparent" />
          </g>
        </svg>

        <div className="backgammon-controls">
          <BackgammonDiceSlot
            dice={s.phase === 'moving' ? diceValues : null}
            showRollButton={canRoll}
            onRoll={() => dispatch({ type: 'roll' })}
            movesRemaining={s.movesRemaining}
          />

          {isMyTurn && s.phase === 'moving' && legalMoves.length === 0 && (
            <button type="button" className="backgammon-rollBtn" onClick={() => dispatch({ type: 'end-turn' })}>
              End turn
            </button>
          )}

          {selectedFrom != null && (
            <button type="button" className="backgammon-clearBtn" onClick={() => setSelectedFrom(null)}>
              Clear selection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
