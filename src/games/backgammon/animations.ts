import {
  barCheckerPosition,
  barLayout,
  bearOffCheckerPosition,
  bearOffTray,
  pointCheckerPosition,
  topStackIndex,
  type PointLayout,
} from './layout';
import type { BackgammonState, LastMove, MoveFrom, MoveTo, Side } from './types';

export interface CheckerAnimHide {
  kind: 'point' | 'bar';
  side: Side;
  stackIndex: number;
  pointIndex?: number;
}

export interface CheckerMoveAnimation {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  hideDest?: CheckerAnimHide;
}

function signedCount(points: number[], index: number, side: Side): number {
  const v = points[index] ?? 0;
  return side === 'white' ? Math.max(0, v) : Math.max(0, -v);
}

function positionForFrom(
  from: MoveFrom,
  side: Side,
  state: BackgammonState,
  getLayout: (index: number) => PointLayout,
  bar: ReturnType<typeof barLayout>
): { x: number; y: number } {
  if (from === 'bar') {
    const count = state.bar[side] + 1;
    const stackIndex = Math.max(0, Math.min(count, 3) - 1);
    const xOffset = side === 'white' ? -6 : 6;
    return barCheckerPosition(bar, stackIndex, xOffset);
  }
  const count = signedCount(state.points, from, side) + 1;
  return pointCheckerPosition(getLayout(from), topStackIndex(count));
}

function positionForTo(
  to: MoveTo,
  side: Side,
  state: BackgammonState,
  getLayout: (index: number) => PointLayout,
  bearOff: ReturnType<typeof bearOffTray>
): { x: number; y: number } {
  if (to === 'off') {
    const count = state.off[side];
    return bearOffCheckerPosition(bearOff, Math.max(0, count - 1));
  }
  const count = signedCount(state.points, to, side);
  return pointCheckerPosition(getLayout(to), topStackIndex(count));
}

function hideDestForMove(
  to: MoveTo,
  side: Side,
  state: BackgammonState
): CheckerAnimHide | undefined {
  if (to === 'off') return undefined;
  const count = signedCount(state.points, to, side);
  return {
    kind: 'point',
    side,
    stackIndex: topStackIndex(count),
    pointIndex: to,
  };
}

export function buildMoveAnimations(
  lastMove: LastMove,
  state: BackgammonState,
  movingSide: Side,
  movingColor: string,
  opponentColor: string,
  getLayout: (index: number) => PointLayout,
  nextId: () => number
): CheckerMoveAnimation[] {
  const bar = barLayout();
  const bearOff = bearOffTray('right');
  const opponentSide: Side = movingSide === 'white' ? 'black' : 'white';

  const animations: CheckerMoveAnimation[] = [
    {
      id: nextId(),
      from: positionForFrom(lastMove.from, movingSide, state, getLayout, bar),
      to: positionForTo(lastMove.to, movingSide, state, getLayout, bearOff),
      color: movingColor,
      hideDest: hideDestForMove(lastMove.to, movingSide, state),
    },
  ];

  if (lastMove.hit && typeof lastMove.to === 'number') {
    const barCount = state.bar[opponentSide];
    animations.push({
      id: nextId(),
      from: pointCheckerPosition(getLayout(lastMove.to), 0),
      to: barCheckerPosition(
        bar,
        Math.max(0, Math.min(barCount, 3) - 1),
        opponentSide === 'white' ? -6 : 6
      ),
      color: opponentColor,
      hideDest: {
        kind: 'bar',
        side: opponentSide,
        stackIndex: Math.max(0, Math.min(barCount, 3) - 1),
      },
    });
  }

  return animations;
}

export function shouldHideChecker(
  animations: CheckerMoveAnimation[],
  kind: 'point' | 'bar',
  side: Side,
  stackIndex: number,
  pointIndex?: number
): boolean {
  return animations.some((anim) => {
    const hide = anim.hideDest;
    if (!hide || hide.kind !== kind || hide.side !== side || hide.stackIndex !== stackIndex) {
      return false;
    }
    if (kind === 'point') {
      return hide.pointIndex === pointIndex;
    }
    return true;
  });
}
