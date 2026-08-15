/** SVG layout for the backgammon board — geometry only, no rules. */

export const BOARD_VIEW_BOX = { width: 400, height: 520 };

export interface PointLayout {
  index: number;
  apexX: number;
  apexY: number;
  baseLeftX: number;
  baseLeftY: number;
  baseRightX: number;
  baseRightY: number;
  stackX: number;
  stackY: number;
  pointsDown: boolean;
}

const MARGIN = 24;
const BAR_W = 28;
const INNER_W = BOARD_VIEW_BOX.width - MARGIN * 2;
const HALF_H = (BOARD_VIEW_BOX.height - MARGIN * 2 - BAR_W) / 2;
const POINT_W = (INNER_W - BAR_W) / 12;

function makePoint(
  index: number,
  col: number,
  half: 'top' | 'bottom',
  rightOfBar: boolean
): PointLayout {
  const topY = MARGIN;
  const bottomY = MARGIN + HALF_H + BAR_W;
  const pointsDown = half === 'bottom';
  const baseY = half === 'bottom' ? bottomY + HALF_H : topY;
  const apexY = half === 'bottom' ? bottomY : topY + HALF_H;
  const x0 = rightOfBar
    ? MARGIN + 6 * POINT_W + BAR_W + col * POINT_W
    : MARGIN + col * POINT_W;
  const x1 = x0 + POINT_W;
  return {
    index,
    apexX: (x0 + x1) / 2,
    apexY,
    baseLeftX: x0,
    baseLeftY: baseY,
    baseRightX: x1,
    baseRightY: baseY,
    stackX: (x0 + x1) / 2,
    stackY: baseY,
    pointsDown,
  };
}

/** Classic white view: bottom 12→1, top 13→24. */
export function defaultPointLayouts(): PointLayout[] {
  const layouts: PointLayout[] = [];
  const bottomLeft = [11, 10, 9, 8, 7, 6];
  const bottomRight = [5, 4, 3, 2, 1, 0];
  const topLeft = [12, 13, 14, 15, 16, 17];
  const topRight = [18, 19, 20, 21, 22, 23];

  bottomLeft.forEach((idx, col) => layouts.push(makePoint(idx, col, 'bottom', false)));
  bottomRight.forEach((idx, col) => layouts.push(makePoint(idx, col, 'bottom', true)));
  topLeft.forEach((idx, col) => layouts.push(makePoint(idx, col, 'top', false)));
  topRight.forEach((idx, col) => layouts.push(makePoint(idx, col, 'top', true)));
  return layouts;
}

export function checkerStackOffset(stackIndex: number, pointsDown: boolean): { dx: number; dy: number } {
  const step = 7;
  return {
    dx: 0,
    dy: pointsDown ? -stackIndex * step : stackIndex * step,
  };
}

export function barLayout(): { x: number; y: number; width: number; height: number } {
  return {
    x: MARGIN + 6 * POINT_W,
    y: MARGIN + HALF_H,
    width: BAR_W,
    height: BAR_W,
  };
}

export function bearOffTray(side: 'left' | 'right'): { x: number; y: number; width: number; height: number } {
  const h = BOARD_VIEW_BOX.height - MARGIN * 2;
  if (side === 'left') {
    return { x: 4, y: MARGIN, width: 14, height: h };
  }
  return { x: BOARD_VIEW_BOX.width - 18, y: MARGIN, width: 14, height: h };
}

export function pointTrianglePath(layout: PointLayout): string {
  return `M ${layout.baseLeftX} ${layout.baseLeftY} L ${layout.apexX} ${layout.apexY} L ${layout.baseRightX} ${layout.baseRightY} Z`;
}

export function boardViewBox(): string {
  return `0 0 ${BOARD_VIEW_BOX.width} ${BOARD_VIEW_BOX.height}`;
}
