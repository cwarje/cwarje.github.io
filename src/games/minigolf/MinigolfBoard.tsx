import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MinigolfBall, MinigolfCourse, MinigolfLandmine, MinigolfLandmineMotion, MinigolfPlayer, MinigolfState } from './types';
import { getMinigolfTheme, isFrozenIceHazard, isLavaHazard, MINIGOLF_DEV_THEME_OPTIONS, getMinigolfDevThemeOptionLabel, type MinigolfCourseTheme, type MinigolfDevThemeOption, type MinigolfPalette } from './themes';
import { BALL_RADIUS, COURSE_H, COURSE_W, CUP_RADIUS, WALL_THICKNESS, obstacleEdgeWidth } from './courseGen';
import { MINIGOLF_TICK_MS, SINK_TICKS, isBallAtRest } from './logic';
import { drawIceHazards, drawLavaHazards, drawWaterHazards } from './waterRender';
import {
  PLAYER_COLOR_HEX,
  getPlayerHudTextColor,
  normalizePlayerColor,
} from '../../networking/playerColors';

interface MinigolfBoardProps {
  state: MinigolfState;
  myId: string;
  onAction: (action: unknown) => void;
}

interface AimDrag {
  pointerId: number;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

interface BoardFit {
  boardWidth: number;
  boardHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** Drag distance (course units) that produces a full-power stroke. */
const FULL_POWER_DRAG_UNITS = 55;
const MIN_POWER = 0.05;

function drawWoodPlanks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
) {
  const plankGap = Math.max(3, 4 * scale);
  const stripeH = Math.max(1, 0.5 * scale);
  ctx.fillStyle = palette.wallEdge;
  ctx.globalAlpha = 0.25;
  for (let py = y + plankGap; py < y + h - stripeH; py += plankGap) {
    ctx.fillRect(x, py, w, stripeH);
  }
  ctx.globalAlpha = 1;
}

function drawSandstoneBricks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
) {
  const brickH = Math.max(3, 3 * scale);
  const brickW = Math.max(5, 6 * scale);
  const mortar = Math.max(1, 0.35 * scale);
  const seedBase = Math.round(x * 19 + y * 37 + w * 11 + h * 23);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  for (let row = 0, by = y; by < y + h; row++, by += brickH + mortar) {
    const rowH = Math.min(brickH, y + h - by);
    if (rowH <= 0) break;
    const offset = (row % 2) * (brickW / 2);
    for (let col = 0, bx = x + offset; bx < x + w; col++, bx += brickW + mortar) {
      const bw = Math.min(brickW, x + w - bx);
      if (bw <= 0) break;
      const tone = sandSpeckFraction(seedBase + row * 17 + col * 31);
      ctx.fillStyle = tone < 0.45 ? palette.wallFill : palette.wallEdge;
      ctx.globalAlpha = tone < 0.45 ? 1 : 0.18;
      ctx.fillRect(bx, by, bw, rowH);
    }
  }

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = palette.wallEdge;
  for (let row = 0, by = y; by < y + h; row++, by += brickH + mortar) {
    const rowH = Math.min(brickH, y + h - by);
    if (rowH <= 0) break;
    const offset = (row % 2) * (brickW / 2);
    ctx.fillRect(x, by + rowH, w, mortar);
    for (let bx = x + offset + brickW; bx < x + w; bx += brickW + mortar) {
      ctx.fillRect(bx - mortar, by, mortar, rowH);
    }
  }

  ctx.restore();
}

function drawIceBlocks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
) {
  const blockSize = Math.max(4, 4 * scale);
  const seam = Math.max(1, 0.35 * scale);
  const seedBase = Math.round(x * 23 + y * 41 + w * 13 + h * 29);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  for (let row = 0, by = y; by < y + h; row++, by += blockSize + seam) {
    const bh = Math.min(blockSize, y + h - by);
    if (bh <= 0) break;
    for (let col = 0, bx = x; bx < x + w; col++, bx += blockSize + seam) {
      const bw = Math.min(blockSize, x + w - bx);
      if (bw <= 0) break;
      const tone = sandSpeckFraction(seedBase + row * 19 + col * 37);
      ctx.fillStyle = tone < 0.55 ? palette.wallFill : 'rgba(255,255,255,0.45)';
      ctx.globalAlpha = 1;
      ctx.fillRect(bx, by, bw, bh);
    }
  }

  ctx.fillStyle = palette.wallEdge;
  ctx.globalAlpha = 0.35;
  for (let by = y; by < y + h; by += blockSize + seam) {
    const bh = Math.min(blockSize, y + h - by);
    if (bh <= 0) break;
    ctx.fillRect(x, by + bh, w, seam);
    for (let bx = x + blockSize; bx < x + w; bx += blockSize + seam) {
      ctx.fillRect(bx - seam, by, seam, bh);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.globalAlpha = 0.7;
  for (let by = y; by < y + h; by += blockSize + seam) {
    const bh = Math.min(blockSize, y + h - by);
    if (bh <= 0) break;
    for (let bx = x; bx < x + w; bx += blockSize + seam) {
      const bw = Math.min(blockSize, x + w - bx);
      if (bw <= 1) continue;
      const gleamW = Math.max(1, bw * 0.4);
      const gleamH = Math.max(1, bh * 0.3);
      ctx.fillRect(bx + 1, by + 1, gleamW, gleamH);
    }
  }

  ctx.restore();
}

function drawFoliageWalls(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
) {
  const seedBase = Math.round(x * 29 + y * 43 + w * 17 + h * 31);
  const leafSize = Math.max(3, 3.5 * scale);
  const leafCount = Math.max(6, Math.floor((w * h) / (leafSize * leafSize * 2.5)));

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.strokeStyle = palette.wallEdge;
  ctx.lineWidth = Math.max(1, 0.5 * scale);
  ctx.globalAlpha = 0.35;
  const vineSpacing = Math.max(8, 10 * scale);
  for (let vx = x + vineSpacing * 0.5; vx < x + w; vx += vineSpacing) {
    ctx.beginPath();
    ctx.moveTo(vx, y + h);
    ctx.quadraticCurveTo(vx + vineSpacing * 0.15, y + h * 0.5, vx - vineSpacing * 0.1, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < leafCount; i++) {
    const fx = sandSpeckFraction(seedBase + i * 5);
    const fy = sandSpeckFraction(seedBase + i * 5 + 1);
    const tone = sandSpeckFraction(seedBase + i * 5 + 2);
    const angle = sandSpeckFraction(seedBase + i * 5 + 3) * Math.PI * 2;
    const lx = x + fx * (w - leafSize);
    const ly = y + fy * (h - leafSize);
    const lw = leafSize * (0.7 + tone * 0.6);
    const lh = leafSize * (0.4 + tone * 0.5);

    ctx.save();
    ctx.translate(lx + lw / 2, ly + lh / 2);
    ctx.rotate(angle);
    ctx.fillStyle = tone < 0.35 ? palette.wallEdge : tone < 0.7 ? palette.wallFill : 'rgba(80,160,70,0.55)';
    ctx.globalAlpha = tone < 0.7 ? 1 : 0.75;
    ctx.beginPath();
    ctx.ellipse(0, 0, lw / 2, lh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawStarfieldWalls(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
) {
  const speckSize = Math.max(1, 0.7 * scale);
  const seedBase = Math.round(x * 17 + y * 31 + w * 7 + h * 13);
  const speckCount = Math.max(4, Math.floor((w * h) / (12 * scale * scale)));

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  for (let i = 0; i < speckCount; i++) {
    const fx = sandSpeckFraction(seedBase + i * 3);
    const fy = sandSpeckFraction(seedBase + i * 3 + 1);
    const tone = sandSpeckFraction(seedBase + i * 3 + 2);
    ctx.fillStyle = tone < 0.5 ? '#ffd966' : '#fff4b0';
    ctx.fillRect(x + fx * (w - speckSize), y + fy * (h - speckSize), speckSize, speckSize);
  }

  ctx.restore();
}

function drawFencePosts(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
) {
  const postW = Math.max(2, 2.5 * scale);
  const gapW = Math.max(3, 4 * scale);
  const spacing = postW + gapW;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  for (let px = x; px < x + w; px += spacing) {
    const pw = Math.min(postW, x + w - px);
    if (pw <= 0) break;
    ctx.fillStyle = palette.wallFill;
    ctx.fillRect(px, y, pw, h);
    ctx.fillStyle = palette.wallEdge;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(px, y, Math.max(1, pw * 0.3), h);
    ctx.globalAlpha = 1;
    const gapStart = px + pw;
    const gw = Math.min(gapW, x + w - gapStart);
    if (gw > 0) {
      ctx.fillStyle = palette.fairwayBase;
      ctx.fillRect(gapStart, y, gw, h);
    }
  }

  ctx.restore();
}

function drawBarnWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
) {
  ctx.fillStyle = '#c81820';
  ctx.fillRect(x, y, w, h);

  const lineWidth = Math.max(2, 1.2 * scale);
  const inset = lineWidth / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(x + w - inset, y + h - inset);
  ctx.moveTo(x + w - inset, y + inset);
  ctx.lineTo(x + inset, y + h - inset);
  ctx.stroke();
}

function drawVolcanoRockWalls(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
) {
  const seedBase = Math.round(x * 31 + y * 47 + w * 19 + h * 37);
  const veinW = Math.max(1, 0.8 * scale);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = palette.wallFill;
  ctx.fillRect(x, y, w, h);

  const veinCount = Math.max(3, Math.floor((w * h) / (40 * scale * scale)));
  for (let i = 0; i < veinCount; i++) {
    const fx = sandSpeckFraction(seedBase + i * 7);
    const fy = sandSpeckFraction(seedBase + i * 7 + 1);
    const angle = sandSpeckFraction(seedBase + i * 7 + 2) * Math.PI;
    const len = Math.max(w, h) * (0.3 + sandSpeckFraction(seedBase + i * 7 + 3) * 0.5);
    const cx = x + fx * w;
    const cy = y + fy * h;
    const tone = sandSpeckFraction(seedBase + i * 7 + 4);
    ctx.strokeStyle = tone < 0.5 ? '#e85810' : '#ff8830';
    ctx.lineWidth = veinW * (0.8 + tone * 0.6);
    ctx.globalAlpha = 0.55 + tone * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * len / 2, cy - Math.sin(angle) * len / 2);
    ctx.lineTo(cx + Math.cos(angle) * len / 2, cy + Math.sin(angle) * len / 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function isFarmBarnWall(w: number, h: number, scale: number): boolean {
  const minDim = WALL_THICKNESS * scale + scale;
  return w > minDim && h > minDim;
}

function drawWallRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
  theme: MinigolfCourseTheme,
) {
  ctx.fillStyle = palette.wallFill;
  ctx.fillRect(x, y, w, h);

  if (theme === 'farm') {
    if (isFarmBarnWall(w, h, scale)) {
      drawBarnWall(ctx, x, y, w, h, scale);
    } else {
      drawFencePosts(ctx, x, y, w, h, palette, scale);
    }
  } else if (theme === 'volcano') {
    drawVolcanoRockWalls(ctx, x, y, w, h, palette, scale);
  } else if (theme === 'desert' || theme === 'sahara' || theme === 'australia') {
    drawSandstoneBricks(ctx, x, y, w, h, palette, scale);
  } else if (theme === 'tundra') {
    drawIceBlocks(ctx, x, y, w, h, palette, scale);
  } else if (theme === 'chocolate') {
    // flat fill — palette.wallFill only
  } else if (theme === 'cemetery') {
    drawSandstoneBricks(ctx, x, y, w, h, palette, scale);
  } else if (theme === 'jungle') {
    drawFoliageWalls(ctx, x, y, w, h, palette, scale);
  } else if (theme === 'space') {
    drawStarfieldWalls(ctx, x, y, w, h, scale);
  } else {
    drawWoodPlanks(ctx, x, y, w, h, palette, scale);
  }

  ctx.strokeStyle = palette.wallEdge;
  ctx.lineWidth = obstacleEdgeWidth(scale);
  ctx.strokeRect(x, y, w, h);
}

function drawCourseWalls(
  ctx: CanvasRenderingContext2D,
  course: MinigolfCourse,
  scale: number,
  theme: MinigolfCourseTheme,
) {
  const { palette } = getMinigolfTheme(theme);
  for (const wall of course.walls) {
    drawWallRect(ctx, wall.x * scale, wall.y * scale, wall.w * scale, wall.h * scale, palette, scale, theme);
  }
}

function sandSpeckFraction(seed: number): number {
  let n = (seed * 2654435761) >>> 0;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  return (n >>> 0) / 0xffffffff;
}

function drawSandTrapRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  palette: MinigolfPalette,
  scale: number,
) {
  ctx.fillStyle = palette.sandTrapFill;
  ctx.fillRect(x, y, w, h);

  const speckSize = Math.max(1, 0.6 * scale);
  const seedBase = Math.round(x * 17 + y * 31 + w * 7 + h * 13);
  const speckCount = Math.max(4, Math.floor((w * h) / (12 * scale * scale)));
  for (let i = 0; i < speckCount; i++) {
    const fx = sandSpeckFraction(seedBase + i * 3);
    const fy = sandSpeckFraction(seedBase + i * 3 + 1);
    const tone = sandSpeckFraction(seedBase + i * 3 + 2);
    ctx.fillStyle = tone < 0.5 ? palette.sandTrapEdge : 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + fx * (w - speckSize), y + fy * (h - speckSize), speckSize, speckSize);
  }

  ctx.strokeStyle = palette.sandTrapEdge;
  ctx.lineWidth = obstacleEdgeWidth(scale);
  ctx.strokeRect(x, y, w, h);
}

function drawFlag(
  ctx: CanvasRenderingContext2D,
  cupX: number,
  cupY: number,
  scale: number,
  timeMs: number,
): void {
  const poleH = 14 * scale;
  const poleTopY = cupY - poleH;
  const phase = timeMs * 0.002;
  const tipX = cupX + 7 * scale + Math.sin(phase) * 0.75 * scale;
  const tipY = poleTopY + 2.5 * scale + Math.sin(phase * 0.9 + 0.6) * 0.55 * scale;

  ctx.beginPath();
  ctx.moveTo(cupX, poleTopY);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(cupX, poleTopY + 5 * scale);
  ctx.closePath();
  ctx.fillStyle = '#ef4444';
  ctx.fill();
}

function interpolateLandminePosition(
  mine: MinigolfLandmine,
  prevMotion: MinigolfLandmineMotion | undefined,
  curMotion: MinigolfLandmineMotion | undefined,
  alpha: number,
): { x: number; y: number; facingPositive: boolean } {
  const cur = curMotion ?? { x: mine.x, y: mine.y, facingPositive: true };
  if (!prevMotion || alpha >= 1) {
    return { x: cur.x, y: cur.y, facingPositive: cur.facingPositive };
  }
  return {
    x: prevMotion.x + (cur.x - prevMotion.x) * alpha,
    y: prevMotion.y + (cur.y - prevMotion.y) * alpha,
    facingPositive: cur.facingPositive,
  };
}

function drawLandmines(
  ctx: CanvasRenderingContext2D,
  course: MinigolfCourse,
  scale: number,
  triggeredIndices: number[],
  landmineMotion: MinigolfLandmineMotion[] | undefined,
  prevLandmineMotion: MinigolfLandmineMotion[] | undefined,
  alpha: number,
) {
  const landmines = course.landmines;
  if (!landmines?.length) return;
  const triggered = new Set(triggeredIndices);
  const size = Math.max(12, 10 * scale);
  ctx.font = `${size}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < landmines.length; i++) {
    if (triggered.has(i)) continue;
    const mine = landmines[i];
    const { x, y, facingPositive } = interpolateLandminePosition(
      mine,
      prevLandmineMotion?.[i],
      landmineMotion?.[i],
      alpha,
    );
    const px = x * scale;
    const py = y * scale;

    if (mine.motion === 'horizontal') {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(facingPositive ? -1 : 1, 1);
      ctx.fillText(mine.emoji, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(mine.emoji, px, py);
    }
  }
}

function drawCourse(
  ctx: CanvasRenderingContext2D,
  course: MinigolfCourse,
  scale: number,
  theme: MinigolfCourseTheme,
) {
  const { palette } = getMinigolfTheme(theme);
  const w = COURSE_W * scale;
  const h = COURSE_H * scale;

  ctx.fillStyle = palette.fairwayBase;
  ctx.fillRect(0, 0, w, h);

  // Mowed checker stripes.
  const cell = 14 * scale;
  ctx.fillStyle = palette.fairwayAlt;
  for (let row = 0; row * cell < h; row++) {
    for (let col = 0; col * cell < w; col++) {
      if ((row + col) % 2 === 0) continue;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }

  // Sand traps (desert slow zones).
  for (const trap of course.sandTraps ?? []) {
    drawSandTrapRect(
      ctx,
      trap.x * scale,
      trap.y * scale,
      trap.w * scale,
      trap.h * scale,
      palette,
      scale,
    );
  }

  // Tee marker.
  ctx.beginPath();
  ctx.arc(course.tee.x * scale, course.tee.y * scale, 4.5 * scale, 0, Math.PI * 2);
  ctx.strokeStyle = palette.teeStroke;
  ctx.lineWidth = Math.max(1, 0.7 * scale);
  ctx.stroke();

  // Cup with rim + pole (flag drawn dynamically each frame).
  const cupX = course.cup.x * scale;
  const cupY = course.cup.y * scale;
  const cupR = CUP_RADIUS * scale;
  ctx.beginPath();
  ctx.arc(cupX, cupY, cupR, 0, Math.PI * 2);
  ctx.fillStyle = palette.cupFill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = obstacleEdgeWidth(scale);
  ctx.stroke();

  const poleH = 14 * scale;
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = Math.max(1, 0.7 * scale);
  ctx.beginPath();
  ctx.moveTo(cupX, cupY);
  ctx.lineTo(cupX, cupY - poleH);
  ctx.stroke();

  if (isFrozenIceHazard(theme)) {
    drawIceHazards(ctx, course.waterHazards ?? [], course.walls, scale, palette);
  }
}

function fitCourse(width: number, height: number): BoardFit {
  const scale = Math.min(width / COURSE_W, height / COURSE_H);
  const boardWidth = Math.floor(COURSE_W * scale);
  const boardHeight = Math.floor(COURSE_H * scale);
  return {
    boardWidth,
    boardHeight,
    offsetX: Math.floor((width - boardWidth) / 2),
    offsetY: Math.floor((height - boardHeight) / 2),
    scale: boardWidth / COURSE_W,
  };
}

function interpolateBall(prev: MinigolfBall | undefined, cur: MinigolfBall, alpha: number): { x: number; y: number } {
  if (!prev) return { x: cur.x, y: cur.y };
  // Snap on teleports (hole change, cup capture).
  if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 20) return { x: cur.x, y: cur.y };
  return {
    x: prev.x + (cur.x - prev.x) * alpha,
    y: prev.y + (cur.y - prev.y) * alpha,
  };
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  ballX: number,
  ballY: number,
  aim: AimDrag,
  scale: number,
) {
  const dragX = aim.curX - aim.startX;
  const dragY = aim.curY - aim.startY;
  const dragUnits = Math.hypot(dragX, dragY) / scale;
  const power = Math.min(1, dragUnits / FULL_POWER_DRAG_UNITS);
  if (power < MIN_POWER) return;

  const angle = Math.atan2(-dragY, -dragX);
  const len = (10 + power * 32) * scale;
  const endX = ballX + Math.cos(angle) * len;
  const endY = ballY + Math.sin(angle) * len;

  const red = Math.round(255);
  const greenBlue = Math.round(255 * (1 - power * 0.85));
  const color = `rgb(${red}, ${greenBlue}, ${greenBlue})`;

  const headLen = 3.4 * scale;
  const headSpread = 0.45;
  const lineEndX = endX - Math.cos(angle) * headLen * Math.cos(headSpread);
  const lineEndY = endY - Math.sin(angle) * headLen * Math.cos(headSpread);

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, 1 * scale);
  ctx.beginPath();
  ctx.moveTo(ballX, ballY);
  ctx.lineTo(lineEndX, lineEndY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head — tip sits at the end of the power meter.
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - Math.cos(angle - headSpread) * headLen, endY - Math.sin(angle - headSpread) * headLen);
  ctx.lineTo(endX - Math.cos(angle + headSpread) * headLen, endY - Math.sin(angle + headSpread) * headLen);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function completedTotal(p: MinigolfPlayer): number {
  return p.scores.reduce((s, v) => s + (v ?? 0), 0);
}

function hasRecordedScores(p: MinigolfPlayer): boolean {
  return p.scores.some((s) => s != null);
}

function sectionTotal(p: MinigolfPlayer, start: number, end: number): number {
  let sum = 0;
  for (let h = start; h < end; h++) {
    sum += p.scores[h] ?? 0;
  }
  return sum;
}

const SCORECARD_HEADER_NEUTRAL = '#f5edd4';

function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return [r, g, b];
}

function scorecardHeaderTextColor(bg: string): '#111827' | '#ffffff' {
  const rgb = parseHexColor(bg);
  if (!rgb) return '#111827';
  const [r, g, b] = rgb.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#111827' : '#ffffff';
}

function scorecardParBadgeBackground(textColor: '#111827' | '#ffffff'): string {
  return textColor === '#111827' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.2)';
}

function formatScorecardTimestamp(date: Date): { label: string; iso: string } {
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return {
    label: `${dateStr}, ${timeStr}`,
    iso: date.toISOString(),
  };
}

function useScorecardClock(): { label: string; iso: string } {
  const [now, setNow] = useState(() => formatScorecardTimestamp(new Date()));

  useEffect(() => {
    const tick = () => setNow(formatScorecardTimestamp(new Date()));
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function scoreToneClass(score: number | undefined, par: number): string {
  if (score === undefined) return '';
  const diff = score - par;
  if (diff < 0) return 'minigolf-scorecardScore--under';
  if (diff > 0) return 'minigolf-scorecardScore--over';
  return 'minigolf-scorecardScore--par';
}

/** Alternating player-tinted cell backgrounds (base / lighter), like spreadsheet banding. */
function getScorecardCellBackground(
  color: MinigolfPlayer['color'],
  cellIndex: number,
): string {
  const hex = PLAYER_COLOR_HEX[normalizePlayerColor(color == null ? null : String(color))];
  if (cellIndex % 2 === 0) {
    return `color-mix(in srgb, ${hex} 88%, black)`;
  }
  return `color-mix(in srgb, ${hex} 78%, white)`;
}

function getScorecardLeaderIds(players: MinigolfPlayer[]): Set<string> {
  const scoredPlayers = players.filter(hasRecordedScores);
  if (scoredPlayers.length === 0) return new Set();

  const bestTotal = Math.min(...scoredPlayers.map(completedTotal));
  const leaders = scoredPlayers.filter((p) => completedTotal(p) === bestTotal);
  if (leaders.length > 1 && leaders.length === scoredPlayers.length) return new Set();
  return new Set(leaders.map((p) => p.id));
}

function ScorecardPlayerLabel({
  player,
  myId,
  isLeader,
}: {
  player: MinigolfPlayer;
  myId: string;
  isLeader: boolean;
}) {
  const displayName = player.id === myId ? 'You' : player.name;
  return (
    <span className="minigolf-scorecardPlayerName">
      {isLeader ? '👑 ' : ''}
      {displayName}
    </span>
  );
}

interface ScorecardSectionProps {
  holeStart: number;
  holeEnd: number;
  holesPlayed: number;
  courses: MinigolfCourse[];
  players: MinigolfPlayer[];
  myId: string;
  subtotalLabel: string;
  grandTotalLabel?: string;
  highlightHole?: number;
  compact: boolean;
  leaderIds: Set<string>;
  themeRevealedUpTo: number;
}

function ScorecardSection({
  holeStart,
  holeEnd,
  holesPlayed,
  courses,
  players,
  myId,
  subtotalLabel,
  grandTotalLabel,
  highlightHole,
  compact,
  leaderIds,
  themeRevealedUpTo,
}: ScorecardSectionProps) {
  const holeCount = holeEnd - holeStart;
  const holeColWidth = `calc((100% - 34%) / ${holeCount})`;
  const holeHeaders = Array.from({ length: holeCount }, (_, i) => {
    const holeIndex = holeStart + i;
    const played = holeIndex < holesPlayed;
    const themeRevealed = holeIndex <= themeRevealedUpTo;
    const headerBg = themeRevealed
      ? getMinigolfTheme(courses[holeIndex].theme).palette.fairwayBase
      : SCORECARD_HEADER_NEUTRAL;
    const headerText = themeRevealed ? scorecardHeaderTextColor(headerBg) : undefined;
    return {
      holeIndex,
      played,
      par: courses[holeIndex].par,
      headerBg,
      headerText,
      highlightClass:
        highlightHole === holeIndex ? 'minigolf-scorecardCol--highlight' : undefined,
    };
  });

  return (
    <div className="minigolf-scorecardScroll">
      <table className={`minigolf-scorecard${compact ? ' minigolf-scorecard--compact' : ''}`}>
        <colgroup>
          <col className="minigolf-scorecardCol--player" />
          {Array.from({ length: holeCount }, (_, i) => (
            <col key={i} style={{ width: holeColWidth }} />
          ))}
          <col
            className={
              grandTotalLabel ? 'minigolf-scorecardCol--totalHalf' : 'minigolf-scorecardCol--total'
            }
          />
          {grandTotalLabel && <col className="minigolf-scorecardCol--totalHalf" />}
        </colgroup>
        <thead>
          <tr>
            <th className="minigolf-scorecardPlayerHead minigolf-scorecardCornerHead" aria-hidden="true" />
            {holeHeaders.map(({ holeIndex, headerBg, headerText, highlightClass }) => (
              <th
                key={holeIndex}
                className={highlightClass}
                style={{
                  background: headerBg,
                  ...(headerText ? { color: headerText } : {}),
                }}
              >
                <span className="minigolf-scorecardHoleNum">{holeIndex + 1}</span>
              </th>
            ))}
            <th className="minigolf-scorecardSubtotalHead">{subtotalLabel}</th>
            {grandTotalLabel && (
              <th className="minigolf-scorecardSubtotalHead">{grandTotalLabel}</th>
            )}
          </tr>
          <tr className="minigolf-scorecardParRow">
            <th className="minigolf-scorecardPlayerHead minigolf-scorecardCornerHead" aria-hidden="true" />
            {holeHeaders.map(({ holeIndex, played, par, headerBg, headerText, highlightClass }) => (
              <th
                key={holeIndex}
                className={highlightClass}
                style={{
                  background: headerBg,
                  ...(headerText ? { color: headerText } : {}),
                }}
              >
                {played && (
                  <span
                    className="minigolf-scorecardPar"
                    style={
                      headerText
                        ? { background: scorecardParBadgeBackground(headerText) }
                        : { background: 'rgba(0, 0, 0, 0.06)' }
                    }
                  >
                    {par}
                  </span>
                )}
              </th>
            ))}
            <th className="minigolf-scorecardSubtotalHead" />
            {grandTotalLabel && <th className="minigolf-scorecardSubtotalHead" />}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const playedEnd = Math.min(holeEnd, holesPlayed);
            const playedInSection = Math.max(0, playedEnd - holeStart);
            const subtotal =
              playedInSection > 0 ? sectionTotal(p, holeStart, playedEnd) : null;
            const isLeader = leaderIds.has(p.id);
            const subtotalCellIndex = 1 + holeCount;
            const grandTotalCellIndex = grandTotalLabel ? subtotalCellIndex + 1 : null;
            const grandTotal = grandTotalLabel ? completedTotal(p) : null;
            return (
              <tr key={p.id}>
                <td
                  className="minigolf-scorecardPlayerCell minigolf-scorecardTintedCell"
                  style={{ background: getScorecardCellBackground(p.color, 0) }}
                >
                  <ScorecardPlayerLabel player={p} myId={myId} isLeader={isLeader} />
                </td>
                {Array.from({ length: holeCount }, (_, i) => {
                  const holeIndex = holeStart + i;
                  const score = holeIndex < holesPlayed ? p.scores[holeIndex] : undefined;
                  const par = courses[holeIndex].par;
                  const cellIndex = 1 + i;
                  return (
                    <td
                      key={holeIndex}
                      style={{ background: getScorecardCellBackground(p.color, cellIndex) }}
                      className={[
                        'minigolf-scorecardScore minigolf-scorecardTintedCell',
                        scoreToneClass(score, par),
                        highlightHole === holeIndex ? 'minigolf-scorecardCol--highlight' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {score ?? '–'}
                    </td>
                  );
                })}
                <td
                  style={{ background: getScorecardCellBackground(p.color, subtotalCellIndex) }}
                  className={`minigolf-scorecardSubtotal minigolf-scorecardTintedCell${isLeader ? ' minigolf-scorecardSubtotal--leader' : ''}`}
                >
                  {subtotal ?? '–'}
                </td>
                {grandTotalCellIndex != null && (
                  <td
                    style={{ background: getScorecardCellBackground(p.color, grandTotalCellIndex) }}
                    className={`minigolf-scorecardSubtotal minigolf-scorecardTintedCell${isLeader ? ' minigolf-scorecardSubtotal--leader' : ''}`}
                  >
                    {grandTotal}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Scorecard({ state, myId }: { state: MinigolfState; myId: string }) {
  const holesPlayed = state.gameOver ? state.courses.length : state.holeIndex + 1;
  const totalHoles = state.courses.length;
  const useFrontBack = totalHoles === 18;
  const compact = holesPlayed > 6 || state.players.length >= 5;
  const highlightHole = state.phase === 'summary' ? state.holeIndex : undefined;
  const themeRevealedUpTo = state.gameOver ? state.courses.length - 1 : state.holeIndex;
  const timestamp = useScorecardClock();

  const players = [...state.players].sort((a, b) => completedTotal(a) - completedTotal(b));
  const leaderIds = getScorecardLeaderIds(players);

  const scorecardContent = useFrontBack ? (
    <div className="minigolf-scorecardSections">
      <div>
        <p className="minigolf-scorecardSectionLabel">Front 9</p>
        <ScorecardSection
          holeStart={0}
          holeEnd={9}
          holesPlayed={holesPlayed}
          courses={state.courses}
          players={players}
          myId={myId}
          subtotalLabel="OUT"
          highlightHole={highlightHole}
          compact={compact}
          leaderIds={leaderIds}
          themeRevealedUpTo={themeRevealedUpTo}
        />
      </div>
      <div>
        <p className="minigolf-scorecardSectionLabel">Back 9</p>
        <ScorecardSection
          holeStart={9}
          holeEnd={18}
          holesPlayed={holesPlayed}
          courses={state.courses}
          players={players}
          myId={myId}
          subtotalLabel="IN"
          grandTotalLabel="TOT"
          highlightHole={highlightHole}
          compact={compact}
          leaderIds={leaderIds}
          themeRevealedUpTo={themeRevealedUpTo}
        />
      </div>
    </div>
  ) : (
    <ScorecardSection
      holeStart={0}
      holeEnd={totalHoles}
      holesPlayed={holesPlayed}
      courses={state.courses}
      players={players}
      myId={myId}
      subtotalLabel="Total"
      highlightHole={highlightHole}
      compact={compact}
      leaderIds={leaderIds}
      themeRevealedUpTo={themeRevealedUpTo}
    />
  );

  return (
    <div className="minigolf-scorecardCard">
      <time className="minigolf-scorecardTimestamp" dateTime={timestamp.iso}>
        {timestamp.label}
      </time>
      {scorecardContent}
    </div>
  );
}

export default function MinigolfBoard({ state, myId, onAction }: MinigolfBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [devTheme, setDevTheme] = useState<MinigolfDevThemeOption>('random');
  const stateRef = useRef<MinigolfState>(state);
  const prevStateRef = useRef<MinigolfState>(state);
  const prevTimeRef = useRef<number>(0);
  const aimRef = useRef<AimDrag | null>(null);
  const fitRef = useRef<BoardFit | null>(null);
  const myIdRef = useRef(myId);

  const course = state.courses[state.holeIndex];
  const me = state.players.find((p) => p.id === myId);
  const meDone = !!me && (me.holed || me.gaveUp);
  const canStroke =
    !!me && state.phase === 'playing' && !meDone && isBallAtRest(me.ball) && me.sinkTicks === 0 && !state.gameOver;
  const showDevRegenerate = import.meta.env.DEV && !state.gameOver;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    prevStateRef.current = stateRef.current;
    stateRef.current = state;
    prevTimeRef.current = performance.now();
  }, [state]);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    setScorecardOpen(false);
  }, [state.holeIndex]);

  useEffect(() => {
    if (state.phase === 'summary') {
      setScorecardOpen(false);
    }
  }, [state.phase]);

  // -------------------------------------------------------------------------
  // Aim input (slingshot drag anywhere on the course)
  // -------------------------------------------------------------------------

  const canStrokeRef = useRef(canStroke);
  useEffect(() => {
    canStrokeRef.current = canStroke;
    if (!canStroke) aimRef.current = null;
  }, [canStroke]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canStrokeRef.current) return;
    const canvas = canvasRef.current;
    const fit = fitRef.current;
    const current = stateRef.current;
    if (!canvas || !fit) return;
    const myPlayer = current.players.find((p) => p.id === myIdRef.current);
    if (!myPlayer) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    canvas.setPointerCapture(e.pointerId);
    aimRef.current = { pointerId: e.pointerId, startX: px, startY: py, curX: px, curY: py };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const aim = aimRef.current;
    const canvas = canvasRef.current;
    if (!aim || !canvas || aim.pointerId !== e.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    aim.curX = e.clientX - rect.left;
    aim.curY = e.clientY - rect.top;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const aim = aimRef.current;
      const fit = fitRef.current;
      if (!aim || aim.pointerId !== e.pointerId) return;
      aimRef.current = null;
      if (!fit || !canStrokeRef.current) return;

      const dragX = aim.curX - aim.startX;
      const dragY = aim.curY - aim.startY;
      const dragUnits = Math.hypot(dragX, dragY) / fit.scale;
      const power = Math.min(1, dragUnits / FULL_POWER_DRAG_UNITS);
      if (power < MIN_POWER) return;

      const angle = Math.atan2(-dragY, -dragX);
      onAction({ type: 'stroke', angle, power });
    },
    [onAction],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (aimRef.current?.pointerId === e.pointerId) aimRef.current = null;
  }, []);

  // -------------------------------------------------------------------------
  // Canvas render loop
  // -------------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;

    const fit = fitCourse(size.width, size.height);
    if (fit.boardWidth <= 0 || fit.boardHeight <= 0) return;
    fitRef.current = fit;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = fit.boardWidth * dpr;
    canvas.height = fit.boardHeight * dpr;
    canvas.style.width = `${fit.boardWidth}px`;
    canvas.style.height = `${fit.boardHeight}px`;
    canvas.style.left = `${fit.offsetX}px`;
    canvas.style.top = `${fit.offsetY}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Static course layer cache; redrawn when the hole changes.
    const courseCanvas = document.createElement('canvas');
    courseCanvas.width = fit.boardWidth * dpr;
    courseCanvas.height = fit.boardHeight * dpr;
    const courseCtx = courseCanvas.getContext('2d');

    // Walls cached separately so they can blit above animated water without redrawing each frame.
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = fit.boardWidth * dpr;
    wallCanvas.height = fit.boardHeight * dpr;
    const wallCtx = wallCanvas.getContext('2d');

    let cachedHoleIndex = -1;
    let cachedCourse: MinigolfCourse | null = null;

    let raf = 0;
    const render = () => {
      const now = performance.now();
      const current = stateRef.current;
      const prev = prevStateRef.current;
      const currentCourse = current.courses[current.holeIndex];

      if (
        courseCtx &&
        wallCtx &&
        (cachedHoleIndex !== current.holeIndex || cachedCourse !== currentCourse)
      ) {
        courseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawCourse(courseCtx, currentCourse, fit.scale, currentCourse.theme);

        wallCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        wallCtx.clearRect(0, 0, fit.boardWidth, fit.boardHeight);
        drawCourseWalls(wallCtx, currentCourse, fit.scale, currentCourse.theme);

        cachedHoleIndex = current.holeIndex;
        cachedCourse = currentCourse;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(courseCanvas, 0, 0, fit.boardWidth, fit.boardHeight);

      const themePalette = getMinigolfTheme(currentCourse.theme).palette;
      if (isLavaHazard(currentCourse.theme)) {
        drawLavaHazards(
          ctx,
          currentCourse.waterHazards ?? [],
          currentCourse.walls,
          fit.scale,
          themePalette,
          now,
        );
      } else if (!isFrozenIceHazard(currentCourse.theme)) {
        drawWaterHazards(
          ctx,
          currentCourse.waterHazards ?? [],
          currentCourse.walls,
          fit.scale,
          themePalette,
          now,
        );
      }

      ctx.drawImage(wallCanvas, 0, 0, fit.boardWidth, fit.boardHeight);

      drawFlag(
        ctx,
        currentCourse.cup.x * fit.scale,
        currentCourse.cup.y * fit.scale,
        fit.scale,
        now,
      );

      const alpha = Math.min(1, (now - prevTimeRef.current) / MINIGOLF_TICK_MS);

      if (current.obstacles) {
        drawLandmines(
          ctx,
          currentCourse,
          fit.scale,
          current.triggeredLandmines,
          current.landmineMotion,
          prev.landmineMotion,
          alpha,
        );
      }

      // Draw other players first so my ball renders on top.
      const ordered = [...current.players].sort((a, b) => {
        if (a.id === myIdRef.current) return 1;
        if (b.id === myIdRef.current) return -1;
        return 0;
      });

      for (const p of ordered) {
        if (p.holed) continue;
        const prevPlayer = prev.players.find((pp) => pp.id === p.id);
        const pos = interpolateBall(prevPlayer?.ball, p.ball, alpha);
        const x = pos.x * fit.scale;
        const y = pos.y * fit.scale;
        const isMe = p.id === myIdRef.current;
        const hex = PLAYER_COLOR_HEX[normalizePlayerColor(p.color)];

        const prevSinkTicks = prevPlayer?.sinkTicks ?? 0;
        const sinkTicks = p.sinkTicks;
        const prevSinkProgress = prevSinkTicks > 0 ? 1 - prevSinkTicks / SINK_TICKS : 0;
        const curSinkProgress = sinkTicks > 0 ? 1 - sinkTicks / SINK_TICKS : 0;
        const sinkProgress =
          prevSinkTicks > 0 || sinkTicks > 0
            ? prevSinkProgress + (curSinkProgress - prevSinkProgress) * alpha
            : 0;
        const sinking = sinkProgress > 0;
        const ballPx = Math.max(3, BALL_RADIUS * fit.scale * (sinking ? 1 - sinkProgress * 0.85 : 1));
        const ballAlpha = sinking ? 1 - sinkProgress : 1;
        const sinkYOffset = sinking ? sinkProgress * ballPx : 0;

        ctx.save();
        ctx.globalAlpha = ballAlpha;

        ctx.beginPath();
        ctx.arc(x, y + ballPx * 0.35 + sinkYOffset, ballPx * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y + sinkYOffset, ballPx, 0, Math.PI * 2);
        ctx.fillStyle = p.gaveUp ? 'rgba(120,120,120,0.6)' : hex;
        ctx.fill();
        if (isMe) {
          ctx.lineWidth = Math.max(1.5, ballPx * 0.35);
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        ctx.restore();

        if (!isMe) {
          const fontSize = Math.max(10, 3.4 * fit.scale);
          ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillText(p.name, x, y - ballPx - 2);
        }
      }

      const aim = aimRef.current;
      if (aim && canStrokeRef.current) {
        const myPlayer = current.players.find((p) => p.id === myIdRef.current);
        if (myPlayer) {
          drawAim(ctx, myPlayer.ball.x * fit.scale, myPlayer.ball.y * fit.scale, aim, fit.scale);
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // -------------------------------------------------------------------------
  // Overlays
  // -------------------------------------------------------------------------

  const themeConfig = getMinigolfTheme(course.theme);

  if (state.gameOver) {
    const winners = state.players.filter((p) => state.winners.includes(p.id));
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="minigolf-gameOver h-full overflow-y-auto px-4"
        style={{ background: themeConfig.chrome.boardBg }}
      >
        <div className="min-h-full flex flex-col items-center justify-center space-y-6 text-center py-8">
          <span className="text-7xl block mx-auto" aria-hidden>⛳</span>
          <h2 className="text-3xl font-extrabold text-white">Game Over!</h2>
          <p className="text-xl text-white/80">
            {winners.length === 1
              ? `${winners[0].id === myId ? 'You win' : `${winners[0].name} wins`}!`
              : `Tie: ${winners.map((w) => (w.id === myId ? 'You' : w.name)).join(', ')}`}
          </p>
          <div className="w-full flex justify-center">
            <div className="minigolf-summaryPanel minigolf-summaryPanel--light">
              <Scorecard state={state} myId={myId} />
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const summarySeconds = Math.ceil((state.summaryTicks * MINIGOLF_TICK_MS) / 1000);
  const isLastHole = state.holeIndex >= state.courses.length - 1;
  const waitingOn = state.players.filter((p) => !p.holed && !p.gaveUp);
  const manualScorecardOpen = scorecardOpen && state.phase === 'playing';
  const showScorecardOverlay = manualScorecardOpen || state.phase === 'summary';

  return (
    <div className="flex h-full w-full flex-col" style={{ background: themeConfig.chrome.boardBg }}>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute block touch-none"
          role="img"
          aria-label={`Minigolf hole ${state.holeIndex + 1} of ${state.courses.length}, par ${course.par}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />

        {showDevRegenerate && (
          <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
            <select
              value={devTheme}
              onChange={(e) => setDevTheme(e.target.value as MinigolfDevThemeOption)}
              className="rounded-md border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200 cursor-pointer"
              aria-label="Dev theme"
            >
              {MINIGOLF_DEV_THEME_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-neutral-900 text-amber-100">
                  {getMinigolfDevThemeOptionLabel(option)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onAction({ type: 'dev-regenerate-hole', devTheme })}
              className="rounded-md border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/30 cursor-pointer"
            >
              Dev: regenerate hole
            </button>
          </div>
        )}

        {/* Scorecard toggle + hole info + player status chips */}
        <div className="minigolf-leftHud">
          <div className="minigolf-hudGrid">
            <div className="minigolf-scorecardCol">
              <button
                type="button"
                className={`minigolf-hudPill minigolf-scorecardBtn${manualScorecardOpen ? ' minigolf-scorecardBtn--active' : ''}`}
                onClick={() => setScorecardOpen((open) => !open)}
                aria-expanded={manualScorecardOpen}
                aria-label="Toggle scorecard"
              >
                Scorecard
              </button>
              <div className="minigolf-chips">
                {state.players.map((p) => (
                  <div key={p.id} className="minigolf-hudPill minigolf-hudPill--dark minigolf-chip">
                    <span className="minigolf-chipName" style={{ color: getPlayerHudTextColor(p.color) }}>
                      {p.id === myId ? 'You' : p.name}
                    </span>
                    <span className="text-white/70">
                      {p.gaveUp ? '✕' : `${p.strokes}${p.holed ? ' ⛳' : ''}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <span className="minigolf-hudPill">
              Hole {state.holeIndex + 1}/{state.courses.length}
            </span>
            <span className="minigolf-hudPill">Par {course.par}</span>
          </div>
        </div>

        {/* Waiting message for players who finished */}
        {meDone && state.phase === 'playing' && waitingOn.length > 0 && (
          <div className="minigolf-waiting" aria-live="polite">
            Waiting on {waitingOn.map((p) => (p.id === myId ? 'you' : p.name)).join(', ')}…
          </div>
        )}

        {/* Aim hint */}
        {canStroke && me && me.strokes === 0 && state.holeIndex === 0 && (
          <div className="minigolf-hint">Drag to aim, release to putt</div>
        )}

        {/* Scorecard overlay (manual toggle or between-holes summary) */}
        {showScorecardOverlay && (
          <div
            className={`minigolf-summaryOverlay${manualScorecardOpen ? ' minigolf-summaryOverlay--plain' : ''}`}
            onClick={manualScorecardOpen ? () => setScorecardOpen(false) : undefined}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              className="minigolf-summaryPanel minigolf-summaryPanel--light"
              onClick={manualScorecardOpen ? (e) => e.stopPropagation() : undefined}
            >
              {state.phase === 'summary' ? (
                <>
                  <h3 className="minigolf-summaryPanelTitle">
                    Hole {state.holeIndex + 1} complete
                  </h3>
                  <Scorecard state={state} myId={myId} />
                  <p className="minigolf-summaryPanelMeta">
                    {isLastHole ? 'Final results' : 'Next hole'} in {summarySeconds}s…
                  </p>
                </>
              ) : (
                <>
                  <h3 className="minigolf-summaryPanelTitle">Scorecard</h3>
                  <Scorecard state={state} myId={myId} />
                </>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
