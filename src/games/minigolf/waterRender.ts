import { obstacleEdgeWidth } from './courseGen';
import type { MinigolfRect } from './types';
import type { MinigolfPalette } from './themes';

const WATER_PHASE_SPEED = 0.00125;

function parseHex(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function mixHex(a: string, b: string, bRatio: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const aRatio = 1 - bRatio;
  const mix = (ac: number, bc: number) => Math.round(ac * aRatio + bc * bRatio);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(ar, br))}${toHex(mix(ag, bg))}${toHex(mix(ab, bb))}`;
}

/** 50/50 blend of hazard edge with checkerboard fairway tones. */
function hazardBorderColor(palette: MinigolfPalette): string {
  const [br, bg, bb] = parseHex(palette.fairwayBase);
  const [ar, ag, ab] = parseHex(palette.fairwayAlt);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const groundHex = `#${toHex(Math.round((br + ar) / 2))}${toHex(Math.round((bg + ag) / 2))}${toHex(Math.round((bb + ab) / 2))}`;
  return mixHex(palette.hazardEdge, groundHex, 0.5);
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
  const phase = timeMs * WATER_PHASE_SPEED;

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
  scale: number,
  palette: MinigolfPalette,
  timeMs: number,
) {
  const x = hazard.x * scale;
  const y = hazard.y * scale;
  const ww = hazard.w * scale;
  const wh = hazard.h * scale;

  drawAnimatedWater(ctx, x, y, ww, wh, scale, palette, timeMs);

  ctx.strokeStyle = hazardBorderColor(palette);
  ctx.lineWidth = obstacleEdgeWidth(scale);
  ctx.strokeRect(x, y, ww, wh);
}

export function drawIceHazards(
  ctx: CanvasRenderingContext2D,
  hazards: MinigolfRect[],
  _walls: MinigolfRect[],
  scale: number,
  palette: MinigolfPalette,
): void {
  if (hazards.length === 0) return;
  for (const hazard of hazards) {
    const x = hazard.x * scale;
    const y = hazard.y * scale;
    const ww = hazard.w * scale;
    const wh = hazard.h * scale;

    ctx.fillStyle = palette.hazardFill;
    ctx.fillRect(x, y, ww, wh);

    const inset = Math.max(2, 2 * scale);
    const innerX = x + inset;
    const innerY = y + inset;
    const innerW = Math.max(0, ww - inset * 2);
    const innerH = Math.max(0, wh - inset * 2);
    if (innerW > 0 && innerH > 0) {
      const gleamW = Math.max(2, innerW * 0.45);
      const gleamH = Math.max(1, innerH * 0.22);
      ctx.fillStyle = palette.hazardHighlight;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(innerX, innerY, gleamW, gleamH);
      const gleam2Y = innerY + innerH * 0.55;
      const gleam2W = Math.max(2, innerW * 0.35);
      const gleam2H = Math.max(1, innerH * 0.15);
      ctx.globalAlpha = 0.2;
      ctx.fillRect(innerX + innerW * 0.1, gleam2Y, gleam2W, gleam2H);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = hazardBorderColor(palette);
    ctx.lineWidth = obstacleEdgeWidth(scale);
    ctx.strokeRect(x, y, ww, wh);
  }
}

export function drawWaterHazards(
  ctx: CanvasRenderingContext2D,
  hazards: MinigolfRect[],
  _walls: MinigolfRect[],
  scale: number,
  palette: MinigolfPalette,
  timeMs: number,
): void {
  if (hazards.length === 0) return;
  for (const hazard of hazards) {
    drawSingleHazard(ctx, hazard, scale, palette, timeMs);
  }
}
