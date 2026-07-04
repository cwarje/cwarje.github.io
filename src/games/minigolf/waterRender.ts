import type { MinigolfRect } from './types';
import type { MinigolfPalette } from './themes';

type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

/** Match wall/sand trap stroke weight from MinigolfBoard.drawCourse. */
function obstacleEdgeWidth(scale: number): number {
  return Math.max(1, 0.4 * scale);
}

function isPointInRect(px: number, py: number, rect: MinigolfRect): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function probePoint(hazard: MinigolfRect, side: EdgeSide): { x: number; y: number } {
  const cx = hazard.x + hazard.w / 2;
  const cy = hazard.y + hazard.h / 2;
  const offset = 0.5;
  switch (side) {
    case 'top':
      return { x: cx, y: hazard.y - offset };
    case 'bottom':
      return { x: cx, y: hazard.y + hazard.h + offset };
    case 'left':
      return { x: hazard.x - offset, y: cy };
    case 'right':
      return { x: hazard.x + hazard.w + offset, y: cy };
  }
}

function isExteriorEdge(
  hazard: MinigolfRect,
  side: EdgeSide,
  hazards: MinigolfRect[],
  walls: MinigolfRect[],
): boolean {
  const { x, y } = probePoint(hazard, side);
  for (const other of hazards) {
    if (other === hazard) continue;
    if (isPointInRect(x, y, other)) return false;
  }
  for (const wall of walls) {
    if (isPointInRect(x, y, wall)) return false;
  }
  return true;
}

function getExteriorEdges(
  hazard: MinigolfRect,
  hazards: MinigolfRect[],
  walls: MinigolfRect[],
): Record<EdgeSide, boolean> {
  return {
    top: isExteriorEdge(hazard, 'top', hazards, walls),
    bottom: isExteriorEdge(hazard, 'bottom', hazards, walls),
    left: isExteriorEdge(hazard, 'left', hazards, walls),
    right: isExteriorEdge(hazard, 'right', hazards, walls),
  };
}

function drawInteriorShore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ww: number,
  wh: number,
  scale: number,
  exterior: Record<EdgeSide, boolean>,
) {
  const depth = obstacleEdgeWidth(scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';

  if (exterior.top) {
    const leftSkip = exterior.left ? depth : 0;
    const rightSkip = exterior.right ? depth : 0;
    const barW = ww - leftSkip - rightSkip;
    if (barW > 0) ctx.fillRect(x + leftSkip, y, barW, depth);
  }
  if (exterior.bottom) {
    const leftSkip = exterior.left ? depth : 0;
    const rightSkip = exterior.right ? depth : 0;
    const barW = ww - leftSkip - rightSkip;
    if (barW > 0) ctx.fillRect(x + leftSkip, y + wh - depth, barW, depth);
  }
  if (exterior.left) {
    const topSkip = exterior.top ? depth : 0;
    const bottomSkip = exterior.bottom ? depth : 0;
    const barH = wh - topSkip - bottomSkip;
    if (barH > 0) ctx.fillRect(x, y + topSkip, depth, barH);
  }
  if (exterior.right) {
    const topSkip = exterior.top ? depth : 0;
    const bottomSkip = exterior.bottom ? depth : 0;
    const barH = wh - topSkip - bottomSkip;
    if (barH > 0) ctx.fillRect(x + ww - depth, y + topSkip, depth, barH);
  }

  if (exterior.top && exterior.left) {
    ctx.fillRect(x, y, depth, depth);
  }
  if (exterior.top && exterior.right) {
    ctx.fillRect(x + ww - depth, y, depth, depth);
  }
  if (exterior.bottom && exterior.left) {
    ctx.fillRect(x, y + wh - depth, depth, depth);
  }
  if (exterior.bottom && exterior.right) {
    ctx.fillRect(x + ww - depth, y + wh - depth, depth, depth);
  }
}

function drawAnimatedWater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ww: number,
  wh: number,
  scale: number,
  palette: MinigolfPalette,
  timeMs: number,
) {
  ctx.fillStyle = palette.hazardFill;
  ctx.fillRect(x, y, ww, wh);

  const inset = Math.max(2, 2 * scale);
  const innerX = x + inset;
  const innerY = y + inset;
  const innerW = Math.max(0, ww - inset * 2);
  const innerH = Math.max(0, wh - inset * 2);
  if (innerW <= 0 || innerH <= 0) return;

  const bandH = Math.max(2, 3 * scale);
  const amplitude = 2 * scale;
  const phase = timeMs * 0.002;

  for (let i = 0; i < 3; i++) {
    const drift = Math.sin(phase + i * 1.4) * amplitude;
    const bandY = innerY + innerH * (0.25 + i * 0.22) + drift;
    ctx.fillStyle = palette.hazardHighlight;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(innerX, bandY, innerW, bandH);
  }

  const shimmerY = innerY + innerH * 0.55 + Math.sin(phase * 0.6 + 2) * amplitude * 1.5;
  ctx.fillStyle = palette.hazardHighlight;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(innerX, shimmerY, innerW, bandH * 1.8);
  ctx.globalAlpha = 1;
}

function drawSingleHazard(
  ctx: CanvasRenderingContext2D,
  hazard: MinigolfRect,
  allHazards: MinigolfRect[],
  walls: MinigolfRect[],
  scale: number,
  palette: MinigolfPalette,
  timeMs: number,
) {
  const x = hazard.x * scale;
  const y = hazard.y * scale;
  const ww = hazard.w * scale;
  const wh = hazard.h * scale;
  const exterior = getExteriorEdges(hazard, allHazards, walls);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, ww, wh);
  ctx.clip();

  drawAnimatedWater(ctx, x, y, ww, wh, scale, palette, timeMs);
  drawInteriorShore(ctx, x, y, ww, wh, scale, exterior);

  ctx.restore();

  ctx.strokeStyle = palette.hazardEdge;
  ctx.lineWidth = obstacleEdgeWidth(scale);
  ctx.strokeRect(x, y, ww, wh);
}

export function drawWaterHazards(
  ctx: CanvasRenderingContext2D,
  hazards: MinigolfRect[],
  walls: MinigolfRect[],
  scale: number,
  palette: MinigolfPalette,
  timeMs: number,
): void {
  if (hazards.length === 0) return;
  for (const hazard of hazards) {
    drawSingleHazard(ctx, hazard, hazards, walls, scale, palette, timeMs);
  }
}
