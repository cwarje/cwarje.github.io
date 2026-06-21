import type { PongPlayer, PongZone } from './types';

export const PONG_TICK_MS = 33;

export const TRACK_WIDTH = 0.04;
export const BALL_RADIUS = 0.032;
export const PADDLE_ZONE_FRACTION = 0.22;
/** Fraction of zone length moved per 33ms tick at full input. */
export const PADDLE_MOVE_PER_TICK = 0.022;
export const BOT_PADDLE_MOVE_PER_TICK = 0.024;
/** Normalized play-area units moved per tick at 30Hz (~1.6s lap at default speed). */
export const BALL_SPEED = 0.019;
/** Linear speed increase per rally tick (~25% faster after ~30s, ~2× after ~2 min). */
export const BALL_SPEED_RAMP_PER_TICK = 0.00028;
/** Ball speed multiplier when every active player is a bot. */
export const BOT_ONLY_BALL_SPEED_MULTIPLIER = 2.5;

export function rallySpeedMultiplier(rallyTicks: number): number {
  return 1 + rallyTicks * BALL_SPEED_RAMP_PER_TICK;
}
export const SERVE_HOLD_MS = 2000;
export const SERVE_HOLD_TICKS = Math.round(SERVE_HOLD_MS / PONG_TICK_MS);
export const START_COUNTDOWN_MS = 3000;
export const START_COUNTDOWN_TICKS = Math.round(START_COUNTDOWN_MS / PONG_TICK_MS);
/** Path center offset from the screen edge (stroke fills edge → path center). */
export const TRACK_HALF = TRACK_WIDTH * 0.5;
/** Inner face of the track where it meets the play area. */
export const TRACK_INNER = TRACK_WIDTH;
/** Track centerline where paddles are drawn; ball bounces when its edge reaches this plane. */
export const BOUNCE_PLANE = TRACK_HALF;
/** Ball center when its edge touches the track centerline (paddle path). */
export const PLAY_MIN = BOUNCE_PLANE + BALL_RADIUS;
export const PLAY_MAX = 1 - BOUNCE_PLANE - BALL_RADIUS;

export interface PerimeterPoint {
  x: number;
  y: number;
  /** Unit normal pointing inward toward play area center. */
  nx: number;
  ny: number;
}

/** Top/bottom track centerline length in normalized coords. */
export const EDGE_LEN_H = 1;
/** Left/right track centerline length in normalized coords. */
export const EDGE_LEN_V = 1 - TRACK_WIDTH;
/** Total track length at aspect ratio 1 (width/height); use perimeterLen(aspect) otherwise. */
export const PERIMETER_LEN = 2 * EDGE_LEN_H + 2 * EDGE_LEN_V;

const SPAN = EDGE_LEN_V;

function horizLen(aspect: number): number {
  return EDGE_LEN_H * aspect;
}

/** Weighted track perimeter; pixel length on a W×H rect equals perimeterLen(W/H) × H. */
export function perimeterLen(aspect: number): number {
  return 2 * horizLen(aspect) + 2 * EDGE_LEN_V;
}

/** Arc length along the track centerline for perimeter parameter t at the given aspect ratio. */
export function perimeterArcLength(t: number, aspect: number): number {
  return normalizeT(t) * perimeterLen(aspect);
}

/** Perimeter parameter t for a given arc length s along the track centerline. */
export function arcLengthToT(s: number, aspect: number): number {
  return normalizeT(s / perimeterLen(aspect));
}

/** Map normalized perimeter parameter t ∈ [0, 1) to a point on the border track path. */
export function perimeterPoint(t: number, aspect: number): PerimeterPoint {
  let s = perimeterArcLength(t, aspect);
  const hLen = horizLen(aspect);

  if (s < hLen) {
    const u = s / hLen;
    return { x: u, y: TRACK_HALF, nx: 0, ny: 1 };
  }
  s -= hLen;

  if (s < EDGE_LEN_V) {
    const u = s / EDGE_LEN_V;
    return { x: 1 - TRACK_HALF, y: TRACK_HALF + u * SPAN, nx: -1, ny: 0 };
  }
  s -= EDGE_LEN_V;

  if (s < hLen) {
    const u = s / hLen;
    return { x: 1 - u, y: 1 - TRACK_HALF, nx: 0, ny: -1 };
  }
  s -= hLen;

  const u = s / EDGE_LEN_V;
  return { x: TRACK_HALF, y: 1 - TRACK_HALF - u * SPAN, nx: 1, ny: 0 };
}

export function zoneLength(zone: PongZone): number {
  if (zone.endT >= zone.startT) return zone.endT - zone.startT;
  return 1 - zone.startT + zone.endT;
}

export function zoneCenterT(zone: PongZone): number {
  const len = zoneLength(zone);
  return normalizeT(zone.startT + len * 0.5);
}

/** Canvas rotation (radians) so text runs along the track at perimeter parameter t. */
export function perimeterTangentAngle(t: number, aspect: number): number {
  const s = perimeterArcLength(t, aspect);
  const hLen = horizLen(aspect);
  if (s < hLen) return 0;
  if (s < hLen + EDGE_LEN_V) return Math.PI / 2;
  if (s < 2 * hLen + EDGE_LEN_V) return Math.PI;
  return -Math.PI / 2;
}

const ZONE_LABEL_INSET = 0.13;

/** Perimeter parameter for a player label near the start end of their zone. */
export function zoneLabelT(zone: PongZone): number {
  const len = zoneLength(zone);
  return normalizeT(zone.startT + len * ZONE_LABEL_INSET);
}

/** Pixel length of a zone arc on a W×H board (uses full rectangle border). */
export function zoneArcLengthPx(zone: PongZone, width: number, height: number): number {
  const aspect = width / height;
  return zoneLength(zone) * perimeterLen(aspect) * height;
}

export function normalizeT(t: number): number {
  return ((t % 1) + 1) % 1;
}

export function tInZone(t: number, zone: PongZone): boolean {
  const nt = normalizeT(t);
  if (zone.endT >= zone.startT) {
    return nt >= zone.startT && nt < zone.endT;
  }
  return nt >= zone.startT || nt < zone.endT;
}

export function findZoneOwner(t: number, zones: PongZone[]): PongZone | null {
  const nt = normalizeT(t);
  for (const zone of zones) {
    if (tInZone(nt, zone)) return zone;
  }
  return null;
}

export function paddleCenterT(zone: PongZone, paddleOffset: number): number {
  const len = zoneLength(zone);
  return normalizeT(zone.startT + len * Math.max(0, Math.min(1, paddleOffset)));
}

export function paddleHalfWidthT(zone: PongZone): number {
  return (zoneLength(zone) * PADDLE_ZONE_FRACTION) / 2;
}

/** Paddle arc clamped to stay inside the player's zone (no perimeter wrap). */
export function paddleArcBounds(
  zone: PongZone,
  paddleOffset: number,
): { startT: number; endT: number } {
  const len = zoneLength(zone);
  const half = paddleHalfWidthT(zone);
  const centerDist = Math.max(0, Math.min(1, paddleOffset)) * len;
  const startDist = Math.max(0, centerDist - half);
  const endDist = Math.min(len, centerDist + half);
  return {
    startT: zone.startT + startDist,
    endT: zone.startT + endDist,
  };
}

function distanceInZone(t: number, centerT: number, zone: PongZone): number {
  const len = zoneLength(zone);
  if (len <= 0) return Infinity;

  const toLocal = (value: number) => {
    let d = normalizeT(value) - zone.startT;
    if (d < 0) d += 1;
    return Math.max(0, Math.min(len, d));
  };

  return Math.abs(toLocal(t) - toLocal(centerT));
}

export function paddleCoversHit(
  hitT: number,
  zone: PongZone,
  paddleOffset: number,
): boolean {
  const center = paddleCenterT(zone, paddleOffset);
  const half = paddleHalfWidthT(zone);
  return distanceInZone(hitT, center, zone) <= half;
}

export function shortestArcDistance(a: number, b: number): number {
  const na = normalizeT(a);
  const nb = normalizeT(b);
  const d = Math.abs(na - nb);
  return Math.min(d, 1 - d);
}

/** Equal zones around the perimeter starting at anchorT (used when a new game begins). */
export function createInitialZones(playerIds: string[], anchorT: number): PongZone[] {
  if (playerIds.length === 0) return [];
  const slice = 1 / playerIds.length;
  return playerIds.map((playerId, index) => ({
    playerId,
    startT: normalizeT(anchorT + index * slice),
    endT: normalizeT(anchorT + (index + 1) * slice),
  }));
}

/** @deprecated Prefer createInitialZones; kept for tests with anchor at 0. */
export function recomputeZones(players: PongPlayer[], anchorT = 0): PongZone[] {
  const alive = players.filter((p) => !p.eliminated);
  return createInitialZones(
    alive.map((p) => p.id),
    anchorT,
  );
}

/**
 * Give each surviving player an equal share of the full border, packed contiguously
 * in zoneOrder starting from the first survivor's original zone start.
 */
export function redistributeSurvivorZones(
  zoneOrder: string[],
  zoneAnchorT: number,
  players: PongPlayer[],
): PongZone[] {
  const initialSlice = 1 / zoneOrder.length;
  const aliveIds = zoneOrder.filter((id) => {
    const p = players.find((player) => player.id === id);
    return p && !p.eliminated && p.lives > 0;
  });
  const n = aliveIds.length;
  if (n === 0) return [];

  const firstAliveIdx = zoneOrder.indexOf(aliveIds[0]!);
  const packStart = normalizeT(zoneAnchorT + firstAliveIdx * initialSlice);
  const slice = 1 / n;

  return aliveIds.map((playerId, index) => ({
    playerId,
    startT: normalizeT(packStart + index * slice),
    endT: normalizeT(packStart + (index + 1) * slice),
  }));
}

/** Remap paddle offsets after zone redistribution, keeping absolute track position. */
export function preservePaddleOffsets(
  players: PongPlayer[],
  oldZones: PongZone[],
  newZones: PongZone[],
): PongPlayer[] {
  return players.map((p) => {
    if (p.eliminated) return p;
    const oldZone = oldZones.find((z) => z.playerId === p.id);
    const newZone = newZones.find((z) => z.playerId === p.id);
    if (!oldZone || !newZone) return p;
    const centerT = paddleCenterT(oldZone, p.paddleOffset);
    return { ...p, paddleOffset: hitTToZoneOffset(newZone, centerT) };
  });
}

export function reflectVelocity(vx: number, vy: number, nx: number, ny: number): { vx: number; vy: number } {
  const dot = vx * nx + vy * ny;
  return {
    vx: vx - 2 * dot * nx,
    vy: vy - 2 * dot * ny,
  };
}

export function getAccentColor(baseHex: string): string {
  return `color-mix(in srgb, ${baseHex} 40%, white)`;
}

/** Convert a play-area contact point to perimeter parameter t. */
export function hitToPerimeterT(x: number, y: number, aspect: number): number {
  const hLen = horizLen(aspect);
  const eps = 1e-5;
  if (y <= BOUNCE_PLANE + eps) {
    return arcLengthToT(x * hLen, aspect);
  }
  if (x >= 1 - BOUNCE_PLANE - eps) {
    const u = (y - TRACK_HALF) / SPAN;
    return arcLengthToT(hLen + u * EDGE_LEN_V, aspect);
  }
  if (y >= 1 - BOUNCE_PLANE - eps) {
    const u = 1 - x;
    return arcLengthToT(hLen + EDGE_LEN_V + u * hLen, aspect);
  }
  const u = (1 - TRACK_HALF - y) / SPAN;
  return arcLengthToT(2 * hLen + EDGE_LEN_V + u * EDGE_LEN_V, aspect);
}

export function randomBallVelocity(speed = BALL_SPEED): { vx: number; vy: number } {
  const angle = Math.random() * Math.PI * 2;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  const minComponent = speed * 0.35;
  if (Math.abs(vx) < minComponent) vx = vx >= 0 ? minComponent : -minComponent;
  if (Math.abs(vy) < minComponent) vy = vy >= 0 ? minComponent : -minComponent;
  const magnitude = Math.hypot(vx, vy);
  const scale = speed / magnitude;
  return { vx: vx * scale, vy: vy * scale };
}

export function centerBall(): { x: number; y: number; vx: number; vy: number } {
  const { vx, vy } = randomBallVelocity();
  return { x: 0.5, y: 0.5, vx, vy };
}

export interface SimBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface BallIntercept {
  hitT: number;
  ticksUntilHit: number;
}

interface WallHit {
  x: number;
  y: number;
  nx: number;
  ny: number;
  t: number;
  time: number;
}

const MAX_SIM_BOUNCES = 12;
const REPOSITION_INSET = BALL_RADIUS * 1.001;

function findNextWallHit(
  ballX: number,
  ballY: number,
  ballVx: number,
  ballVy: number,
  aspect: number,
): WallHit | null {
  const candidates: WallHit[] = [];

  if (ballVy < 0) {
    const time = (PLAY_MIN - ballY) / ballVy;
    if (time > 0) {
      const hx = ballX + ballVx * time;
      if (hx >= PLAY_MIN && hx <= PLAY_MAX) {
        const cx = Math.max(PLAY_MIN, Math.min(PLAY_MAX, hx));
        candidates.push({
          time,
          x: cx,
          y: PLAY_MIN,
          nx: 0,
          ny: 1,
          t: hitToPerimeterT(cx, BOUNCE_PLANE, aspect),
        });
      }
    }
  }

  if (ballVy > 0) {
    const time = (PLAY_MAX - ballY) / ballVy;
    if (time > 0) {
      const hx = ballX + ballVx * time;
      if (hx >= PLAY_MIN && hx <= PLAY_MAX) {
        const cx = Math.max(PLAY_MIN, Math.min(PLAY_MAX, hx));
        candidates.push({
          time,
          x: cx,
          y: PLAY_MAX,
          nx: 0,
          ny: -1,
          t: hitToPerimeterT(cx, 1 - BOUNCE_PLANE, aspect),
        });
      }
    }
  }

  if (ballVx < 0) {
    const time = (PLAY_MIN - ballX) / ballVx;
    if (time > 0) {
      const hy = ballY + ballVy * time;
      if (hy >= PLAY_MIN && hy <= PLAY_MAX) {
        const cy = Math.max(PLAY_MIN, Math.min(PLAY_MAX, hy));
        candidates.push({
          time,
          x: PLAY_MIN,
          y: cy,
          nx: 1,
          ny: 0,
          t: hitToPerimeterT(BOUNCE_PLANE, cy, aspect),
        });
      }
    }
  }

  if (ballVx > 0) {
    const time = (PLAY_MAX - ballX) / ballVx;
    if (time > 0) {
      const hy = ballY + ballVy * time;
      if (hy >= PLAY_MIN && hy <= PLAY_MAX) {
        const cy = Math.max(PLAY_MIN, Math.min(PLAY_MAX, hy));
        candidates.push({
          time,
          x: PLAY_MAX,
          y: cy,
          nx: -1,
          ny: 0,
          t: hitToPerimeterT(1 - BOUNCE_PLANE, cy, aspect),
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.time < best.time ? c : best));
}

function normalizeBallSpeed(
  vx: number,
  vy: number,
  targetSpeed = BALL_SPEED,
): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed <= 0) return { vx: targetSpeed, vy: 0 };
  const scale = targetSpeed / speed;
  return { vx: vx * scale, vy: vy * scale };
}

/** Simulate ball bounces until it reaches a target zone (for bot AI). */
export function simulateBallToZoneIntercept(
  ball: SimBall,
  targetZone: PongZone,
  zones: PongZone[],
  players: PongPlayer[],
  targetSpeed = BALL_SPEED,
  aspect = 1,
): BallIntercept | null {
  if (ball.vx === 0 && ball.vy === 0) return null;

  let { x, y, vx, vy } = ball;
  let elapsed = 0;
  const playerById = new Map(players.map((p) => [p.id, p]));

  for (let bounce = 0; bounce < MAX_SIM_BOUNCES; bounce++) {
    const next = findNextWallHit(x, y, vx, vy, aspect);
    if (!next) return null;

    elapsed += next.time;
    x = next.x;
    y = next.y;

    const zone = findZoneOwner(next.t, zones);
    if (!zone) {
      const reflected = reflectVelocity(vx, vy, next.nx, next.ny);
      vx = reflected.vx;
      vy = reflected.vy;
      x += next.nx * REPOSITION_INSET;
      y += next.ny * REPOSITION_INSET;
      continue;
    }

    if (zone.playerId === targetZone.playerId) {
      return { hitT: next.t, ticksUntilHit: elapsed };
    }

    const defender = playerById.get(zone.playerId);
    if (!defender || defender.eliminated) {
      const reflected = reflectVelocity(vx, vy, next.nx, next.ny);
      vx = reflected.vx;
      vy = reflected.vy;
      x += next.nx * REPOSITION_INSET;
      y += next.ny * REPOSITION_INSET;
      continue;
    }

    if (paddleCoversHit(next.t, zone, defender.paddleOffset)) {
      const reflected = reflectVelocity(vx, vy, next.nx, next.ny);
      ({ vx, vy } = normalizeBallSpeed(reflected.vx, reflected.vy, targetSpeed));
      x += next.nx * REPOSITION_INSET;
      y += next.ny * REPOSITION_INSET;
      continue;
    }

    return null;
  }

  return null;
}

/** Predict where ball will intercept a zone (multi-bounce). Falls back to zone center. */
export function predictHitT(
  ballX: number,
  ballY: number,
  ballVx: number,
  ballVy: number,
  zone: PongZone,
  zones: PongZone[],
  players: PongPlayer[],
  aspect = 1,
): number | null {
  const intercept = simulateBallToZoneIntercept(
    { x: ballX, y: ballY, vx: ballVx, vy: ballVy },
    zone,
    zones,
    players,
    BALL_SPEED,
    aspect,
  );
  return intercept?.hitT ?? zoneCenterT(zone);
}

export function hitTToZoneOffset(zone: PongZone, hitT: number): number {
  const len = zoneLength(zone);
  if (len <= 0) return 0.5;
  let dist = normalizeT(hitT) - zone.startT;
  if (dist < 0) dist += 1;
  return Math.max(0, Math.min(1, dist / len));
}
