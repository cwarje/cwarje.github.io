import type { Player, PlayerColor } from '../../networking/types';
import { PLAYER_COLOR_OPTIONS } from '../../networking/playerColors';
import {
  BALL_RADIUS,
  BALL_SPEED,
  BOT_ONLY_BALL_SPEED_MULTIPLIER,
  BOT_PADDLE_MOVE_PER_TICK,
  PADDLE_MOVE_PER_TICK,
  PONG_TICK_MS,
  PLAY_MAX,
  PLAY_MIN,
  SERVE_HOLD_TICKS,
  START_COUNTDOWN_TICKS,
  BOUNCE_PLANE,
  findZoneOwner,
  hitTToZoneOffset,
  hitToPerimeterT,
  paddleCoversHit,
  randomBallVelocity,
  rallySpeedMultiplier,
  createInitialZones,
  PONG_BOARD_ASPECT,
  redistributeSurvivorZones,
  preservePaddleOffsets,
  reflectVelocity,
  simulateBallToZoneIntercept,
} from './geometry';
import type { PongAction, PongPlayer, PongState } from './types';

const STARTING_LIVES = 2;

const ALL_PLAYER_COLORS = PLAYER_COLOR_OPTIONS.map((o) => o.value);

function shuffleColors(colors: PlayerColor[]): PlayerColor[] {
  const shuffled = [...colors];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Assign each bot a random color, preferring colors not already taken by humans. */
export function assignPongBotColors(players: Player[]): Player[] {
  const usedByHumans = new Set(players.filter((p) => !p.isBot).map((p) => p.color));
  const available = shuffleColors(ALL_PLAYER_COLORS.filter((c) => !usedByHumans.has(c)));

  return players.map((p) => {
    if (!p.isBot) return p;
    const color =
      available.pop() ?? ALL_PLAYER_COLORS[Math.floor(Math.random() * ALL_PLAYER_COLORS.length)];
    return { ...p, color };
  });
}

function normalizeSpeed(
  vx: number,
  vy: number,
  targetSpeed: number,
): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed <= 0) return { vx: targetSpeed, vy: targetSpeed * 0.1 / BALL_SPEED };
  const scale = targetSpeed / speed;
  return { vx: vx * scale, vy: vy * scale };
}

function isBotOnlyMatch(state: PongState): boolean {
  const alive = getAlivePlayers(state);
  return alive.length > 0 && alive.every((p) => p.isBot);
}

function getBaseBallSpeed(state: PongState): number {
  return isBotOnlyMatch(state)
    ? BALL_SPEED * BOT_ONLY_BALL_SPEED_MULTIPLIER
    : BALL_SPEED;
}

function getEffectiveBallSpeed(state: PongState): number {
  const base = getBaseBallSpeed(state);
  if (state.startCountdownTicks > 0 || state.serveHoldTicks > 0) return base;
  return base * rallySpeedMultiplier(state.rallyTicks ?? 0);
}

function rescaleBallVelocity(
  vx: number,
  vy: number,
  targetSpeed: number,
): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed <= 0) return { vx, vy };
  if (Math.abs(speed - targetSpeed) <= 1e-9) return { vx, vy };
  const scale = targetSpeed / speed;
  return { vx: vx * scale, vy: vy * scale };
}

function createPongPlayers(players: Player[]): PongPlayer[] {
  return players.slice(0, 12).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: p.isBot,
    lives: STARTING_LIVES,
    eliminated: false,
    paddleOffset: 0.5,
  }));
}

export function createPongState(players: Player[]): PongState {
  const pongPlayers = createPongPlayers(players);
  const zoneOrder = pongPlayers.map((p) => p.id);
  const zoneAnchorT = Math.random();
  const zones = createInitialZones(zoneOrder, zoneAnchorT);
  const ball = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
  const inputs: Record<string, -1 | 0 | 1> = {};
  for (const p of pongPlayers) inputs[p.id] = 0;

  return {
    players: pongPlayers,
    zones,
    zoneOrder,
    zoneAnchorT,
    ball,
    inputs,
    boardAspect: PONG_BOARD_ASPECT,
    startCountdownTicks: START_COUNTDOWN_TICKS,
    serveHoldTicks: 0,
    rallyTicks: 0,
    lifeLossAnnouncement: null,
    lastTouchPlayerId: null,
    gameOver: false,
    winners: [],
    lastTickAt: Date.now(),
  };
}

function getAlivePlayers(state: PongState): PongPlayer[] {
  return state.players.filter((p) => !p.eliminated && p.lives > 0);
}

function checkWin(state: PongState): PongState {
  if (state.serveHoldTicks > 0) return state;
  const alive = getAlivePlayers(state);
  if (alive.length <= 1 && state.players.some((p) => p.eliminated || p.lives <= 0)) {
    return {
      ...state,
      gameOver: true,
      winners: alive.length === 1 ? [alive[0].id] : [],
    };
  }
  return state;
}

function getBoardAspect(state: PongState): number {
  return PONG_BOARD_ASPECT;
}

function movePaddles(state: PongState, dt: number): PongPlayer[] {
  const dtScale = dt / PONG_TICK_MS;
  const ballSpeed = getEffectiveBallSpeed(state);
  const aspect = getBoardAspect(state);
  return state.players.map((player) => {
    if (player.eliminated || player.lives <= 0) return player;

    const zone = state.zones.find((z) => z.playerId === player.id);
    if (!zone) return player;

    let direction = state.inputs[player.id] ?? 0;

    if (player.isBot) {
      const intercept = simulateBallToZoneIntercept(
        state.ball,
        zone,
        state.zones,
        state.players,
        ballSpeed,
        aspect,
      );
      if (intercept) {
        if (paddleCoversHit(intercept.hitT, zone, player.paddleOffset)) {
          direction = 0;
        } else {
          const targetOffset = hitTToZoneOffset(zone, intercept.hitT);
          const diff = targetOffset - player.paddleOffset;
          const botStep = BOT_PADDLE_MOVE_PER_TICK * dtScale;

          if (Math.abs(diff) <= botStep) {
            return { ...player, paddleOffset: Math.max(0, Math.min(1, targetOffset)) };
          }

          const timeToReach = Math.abs(diff) / BOT_PADDLE_MOVE_PER_TICK;
          if (Math.abs(diff) > 0.005 || timeToReach > intercept.ticksUntilHit) {
            direction = diff > 0 ? 1 : -1;
          } else {
            direction = 0;
          }
        }
      } else {
        direction = 0;
      }
    }

    if (direction === 0) return player;

    const movePerTick = player.isBot ? BOT_PADDLE_MOVE_PER_TICK : PADDLE_MOVE_PER_TICK;
    const delta = direction * movePerTick * dtScale;
    const nextOffset = Math.max(0, Math.min(1, player.paddleOffset + delta));
    return { ...player, paddleOffset: nextOffset };
  });
}

interface BorderHit {
  x: number;
  y: number;
  nx: number;
  ny: number;
  t: number;
}

function repositionAfterBounce(
  hitX: number,
  hitY: number,
  nx: number,
  ny: number,
): { x: number; y: number } {
  const inset = BALL_RADIUS * 1.001;
  return { x: hitX + nx * inset, y: hitY + ny * inset };
}

function detectBorderHit(x: number, y: number, aspect: number): BorderHit | null {
  if (y - BALL_RADIUS <= BOUNCE_PLANE) {
    const clampedX = Math.max(PLAY_MIN, Math.min(PLAY_MAX, x));
    return { x: clampedX, y: PLAY_MIN, nx: 0, ny: 1, t: hitToPerimeterT(clampedX, BOUNCE_PLANE, aspect) };
  }
  if (y + BALL_RADIUS >= 1 - BOUNCE_PLANE) {
    const clampedX = Math.max(PLAY_MIN, Math.min(PLAY_MAX, x));
    return { x: clampedX, y: PLAY_MAX, nx: 0, ny: -1, t: hitToPerimeterT(clampedX, 1 - BOUNCE_PLANE, aspect) };
  }
  if (x - BALL_RADIUS <= BOUNCE_PLANE) {
    const clampedY = Math.max(PLAY_MIN, Math.min(PLAY_MAX, y));
    return { x: PLAY_MIN, y: clampedY, nx: 1, ny: 0, t: hitToPerimeterT(BOUNCE_PLANE, clampedY, aspect) };
  }
  if (x + BALL_RADIUS >= 1 - BOUNCE_PLANE) {
    const clampedY = Math.max(PLAY_MIN, Math.min(PLAY_MAX, y));
    return { x: PLAY_MAX, y: clampedY, nx: -1, ny: 0, t: hitToPerimeterT(1 - BOUNCE_PLANE, clampedY, aspect) };
  }
  return null;
}

function advanceBall(state: PongState, dt: number): PongState {
  const effectiveSpeed = getEffectiveBallSpeed(state);

  if (state.startCountdownTicks > 0) {
    const remaining = state.startCountdownTicks - 1;
    if (remaining > 0) {
      return {
        ...state,
        startCountdownTicks: remaining,
        ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
        lastTouchPlayerId: null,
      };
    }
    const { vx, vy } = randomBallVelocity(effectiveSpeed);
    return {
      ...state,
      startCountdownTicks: 0,
      ball: { x: 0.5, y: 0.5, vx, vy },
      lastTouchPlayerId: null,
    };
  }

  if (state.serveHoldTicks > 0) {
    const remaining = state.serveHoldTicks - 1;
    if (remaining > 0) {
      return {
        ...state,
        serveHoldTicks: remaining,
        ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
        lastTouchPlayerId: null,
      };
    }
    const cleared: PongState = {
      ...state,
      serveHoldTicks: 0,
      lifeLossAnnouncement: null,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
      lastTouchPlayerId: null,
    };
    const afterWin = checkWin(cleared);
    if (afterWin.gameOver) {
      return afterWin;
    }
    const { vx, vy } = randomBallVelocity(effectiveSpeed);
    return {
      ...afterWin,
      ball: { x: 0.5, y: 0.5, vx, vy },
    };
  }

  const dtScale = dt / PONG_TICK_MS;
  let { x, y, vx, vy } = state.ball;
  ({ vx, vy } = rescaleBallVelocity(vx, vy, effectiveSpeed));
  let remaining = dtScale;
  let players = state.players;
  let zones = state.zones;
  let lastTouchPlayerId = state.lastTouchPlayerId;
  const aspect = getBoardAspect(state);

  while (remaining > 0) {
    const step = remaining;
    remaining = 0;

    const nextX = x + vx * step;
    const nextY = y + vy * step;
    const hit = detectBorderHit(nextX, nextY, aspect);

    if (!hit) {
      x = nextX;
      y = nextY;
      continue;
    }

    // Swept contact: back up to the exact touch point along this step.
    let lo = 0;
    let hi = step;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (detectBorderHit(x + vx * mid, y + vy * mid, aspect)) hi = mid;
      else lo = mid;
    }
    x = x + vx * hi;
    y = y + vy * hi;

    const contactHit = detectBorderHit(x, y, aspect);
    if (!contactHit) {
      continue;
    }

    const zone = findZoneOwner(contactHit.t, zones);
    if (!zone) {
      const reflected = reflectVelocity(vx, vy, contactHit.nx, contactHit.ny);
      vx = reflected.vx;
      vy = reflected.vy;
      ({ x, y } = repositionAfterBounce(x, y, contactHit.nx, contactHit.ny));
      continue;
    }

    const defender = players.find((p) => p.id === zone.playerId);
    if (!defender || defender.eliminated) {
      const reflected = reflectVelocity(vx, vy, contactHit.nx, contactHit.ny);
      vx = reflected.vx;
      vy = reflected.vy;
      ({ x, y } = repositionAfterBounce(x, y, contactHit.nx, contactHit.ny));
      continue;
    }

    if (paddleCoversHit(contactHit.t, zone, defender.paddleOffset)) {
      const reflected = reflectVelocity(vx, vy, contactHit.nx, contactHit.ny);
      const normalized = normalizeSpeed(reflected.vx, reflected.vy, effectiveSpeed);
      vx = normalized.vx;
      vy = normalized.vy;
      ({ x, y } = repositionAfterBounce(x, y, contactHit.nx, contactHit.ny));
      lastTouchPlayerId = defender.id;
      continue;
    }

    const newLives = defender.lives - 1;
    const eliminated = newLives <= 0;
    players = players.map((p) => {
      if (p.id !== defender.id) return p;
      return { ...p, lives: Math.max(0, newLives), eliminated };
    });

    const oldZones = zones;
    if (eliminated) {
      zones = redistributeSurvivorZones(state.zoneOrder, state.zoneAnchorT, players);
      players = preservePaddleOffsets(players, oldZones, zones);
    }

    const resetBall = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
    let next: PongState = {
      ...state,
      players,
      zones,
      ball: resetBall,
      serveHoldTicks: SERVE_HOLD_TICKS,
      rallyTicks: 0,
      lifeLossAnnouncement: { playerId: defender.id, eliminated },
      lastTouchPlayerId: null,
    };
    next = checkWin(next);
    return next;
  }

  const ball = { x, y, vx, vy };
  let next: PongState = {
    ...state,
    players,
    zones,
    ball,
    lastTouchPlayerId,
    rallyTicks: (state.rallyTicks ?? 0) + 1,
  };
  next = checkWin(next);
  return next;
}

function processTick(state: PongState, dt: number): PongState {
  if (state.gameOver) return state;

  const movedPlayers = movePaddles(state, dt);
  let next: PongState = {
    ...state,
    players: movedPlayers,
    lastTickAt: Date.now(),
  };
  next = advanceBall(next, dt);
  return next;
}

export function processPongAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as PongState;
  const a = action as PongAction;

  if (!a || typeof a !== 'object' || !('type' in a)) return state;

  switch (a.type) {
    case 'set-input': {
      if (s.gameOver) return state;
      const player = s.players.find((p) => p.id === playerId);
      if (!player || player.eliminated || player.lives <= 0) return state;
      const direction = a.direction === -1 || a.direction === 1 ? a.direction : 0;
      if (s.inputs[playerId] === direction) return state;
      return { ...s, inputs: { ...s.inputs, [playerId]: direction } };
    }
    case 'tick': {
      if (playerId !== '' && playerId != null) return state;
      return processTick(s, a.dt);
    }
    default:
      return state;
  }
}

export function runPongBotTurn(state: unknown): unknown {
  return state;
}

export function isPongOver(state: unknown): boolean {
  return (state as PongState).gameOver;
}

export function getPongWinners(state: unknown): string[] {
  return (state as PongState).winners;
}
