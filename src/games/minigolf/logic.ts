import type { GameStartOptions, Player } from '../../networking/types';
import {
  BALL_RADIUS,
  CUP_RADIUS,
  TEE_STARTING_AREA_RADIUS,
  generateCourses,
  type Rng,
} from './courseGen';
import type {
  MinigolfAction,
  MinigolfBall,
  MinigolfCourse,
  MinigolfPlayer,
  MinigolfRect,
  MinigolfState,
} from './types';

export const MINIGOLF_TICK_MS = 33;
export const HOLES_PER_GAME = 3;
export const MAX_STROKE_SPEED = 4.2;
export const MIN_STROKE_SPEED = 0.55;
export const STOP_SPEED = 0.045;
export const CUP_CAPTURE_SPEED = 2.15;
export const STROKE_CAP_OVER_PAR = 4;
export const SUMMARY_TICKS = Math.round(5000 / MINIGOLF_TICK_MS);

export const SINK_TICKS = 45;

const FRICTION_MULT = 0.978;
const FRICTION_LINEAR = 0.003;
const RESTITUTION = 0.85;

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

export function isBallAtRest(ball: MinigolfBall): boolean {
  return ball.vx === 0 && ball.vy === 0;
}

function collideBallWithRect(ball: MinigolfBall, rect: MinigolfRect): boolean {
  const nx = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
  const dx = ball.x - nx;
  const dy = ball.y - ny;
  const distSq = dx * dx + dy * dy;
  if (distSq >= BALL_RADIUS * BALL_RADIUS) return false;

  let normalX: number;
  let normalY: number;
  let contactX = nx;
  let contactY = ny;
  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    normalX = dx / dist;
    normalY = dy / dist;
  } else {
    // Ball center is inside the rect: push out along the smallest penetration axis.
    const left = ball.x - rect.x;
    const right = rect.x + rect.w - ball.x;
    const top = ball.y - rect.y;
    const bottom = rect.y + rect.h - ball.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) {
      normalX = -1; normalY = 0; contactX = rect.x; contactY = ball.y;
    } else if (min === right) {
      normalX = 1; normalY = 0; contactX = rect.x + rect.w; contactY = ball.y;
    } else if (min === top) {
      normalX = 0; normalY = -1; contactX = ball.x; contactY = rect.y;
    } else {
      normalX = 0; normalY = 1; contactX = ball.x; contactY = rect.y + rect.h;
    }
  }

  ball.x = contactX + normalX * (BALL_RADIUS + 0.01);
  ball.y = contactY + normalY * (BALL_RADIUS + 0.01);

  const dot = ball.vx * normalX + ball.vy * normalY;
  if (dot < 0) {
    ball.vx -= (1 + RESTITUTION) * dot * normalX;
    ball.vy -= (1 + RESTITUTION) * dot * normalY;
  }
  return true;
}

function isBallInStartingArea(ball: MinigolfBall, course: MinigolfCourse): boolean {
  return Math.hypot(ball.x - course.tee.x, ball.y - course.tee.y) <= TEE_STARTING_AREA_RADIUS;
}

function collideBallWithBall(a: MinigolfBall, b: MinigolfBall): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const minDist = BALL_RADIUS * 2;
  if (distSq >= minDist * minDist) return false;

  let normalX: number;
  let normalY: number;
  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    normalX = dx / dist;
    normalY = dy / dist;
  } else {
    normalX = 1;
    normalY = 0;
  }

  const dist = Math.max(Math.sqrt(distSq), 1e-9);
  const pad = (minDist - dist) / 2 + 0.01;
  a.x -= normalX * pad;
  a.y -= normalY * pad;
  b.x += normalX * pad;
  b.y += normalY * pad;

  const vRel = (b.vx - a.vx) * normalX + (b.vy - a.vy) * normalY;
  if (vRel < 0) {
    const impulse = (1 + RESTITUTION) * vRel / 2;
    a.vx += impulse * normalX;
    a.vy += impulse * normalY;
    b.vx -= impulse * normalX;
    b.vy -= impulse * normalY;
  }
  return true;
}

function applyBallFriction(ball: MinigolfBall, dtScale: number): void {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= 0) return;

  const newSpeed = Math.max(0, speed * Math.pow(FRICTION_MULT, dtScale) - FRICTION_LINEAR * dtScale);
  if (newSpeed < STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    return;
  }
  const scale = newSpeed / speed;
  ball.vx *= scale;
  ball.vy *= scale;
}

function stepBallsWithCollisions(
  balls: MinigolfBall[],
  course: MinigolfCourse,
  dtScale: number,
): Array<{ holed: boolean; inWater?: boolean }> {
  const results = balls.map(() => ({ holed: false, inWater: undefined as boolean | undefined }));
  const done = balls.map(() => false);

  let maxTravel = 0;
  for (let i = 0; i < balls.length; i++) {
    applyBallFriction(balls[i], dtScale);
    maxTravel = Math.max(maxTravel, Math.hypot(balls[i].vx, balls[i].vy) * dtScale);
  }

  if (maxTravel <= 0) return results;

  const steps = Math.max(1, Math.ceil(maxTravel / (BALL_RADIUS * 0.75)));
  const stepDt = dtScale / steps;

  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < balls.length; i++) {
      if (done[i]) continue;
      const speed = Math.hypot(balls[i].vx, balls[i].vy);
      if (speed <= 0) continue;
      balls[i].x += balls[i].vx * stepDt;
      balls[i].y += balls[i].vy * stepDt;
    }

    for (let pass = 0; pass < 3; pass++) {
      let hitAny = false;
      for (let i = 0; i < balls.length; i++) {
        if (done[i]) continue;
        for (const wall of course.walls) {
          if (collideBallWithRect(balls[i], wall)) hitAny = true;
        }
      }
      if (!hitAny) break;
    }

    for (let pass = 0; pass < 3; pass++) {
      let hitAny = false;
      for (let i = 0; i < balls.length; i++) {
        if (done[i]) continue;
        for (let j = i + 1; j < balls.length; j++) {
          if (done[j]) continue;
          if (isBallInStartingArea(balls[i], course) || isBallInStartingArea(balls[j], course)) continue;
          if (collideBallWithBall(balls[i], balls[j])) hitAny = true;
        }
      }
      if (!hitAny) break;
    }

    for (let i = 0; i < balls.length; i++) {
      if (done[i]) continue;
      const ball = balls[i];
      const cupDist = Math.hypot(ball.x - course.cup.x, ball.y - course.cup.y);
      const currentSpeed = Math.hypot(ball.vx, ball.vy);
      if (cupDist < CUP_RADIUS && currentSpeed < CUP_CAPTURE_SPEED) {
        ball.x = course.cup.x;
        ball.y = course.cup.y;
        ball.vx = 0;
        ball.vy = 0;
        results[i].holed = true;
        done[i] = true;
        continue;
      }
      if (ballInAnyWater(ball, course.waterHazards ?? [])) {
        ball.vx = 0;
        ball.vy = 0;
        results[i].inWater = true;
        done[i] = true;
      }
    }
  }

  return results;
}

function isBallInWater(ball: MinigolfBall, water: MinigolfRect): boolean {
  return (
    ball.x >= water.x &&
    ball.x <= water.x + water.w &&
    ball.y >= water.y &&
    ball.y <= water.y + water.h
  );
}

function ballInAnyWater(ball: MinigolfBall, waterHazards: MinigolfRect[]): boolean {
  for (const water of waterHazards) {
    if (isBallInWater(ball, water)) return true;
  }
  return false;
}

/**
 * Advances a ball one tick. Mutates and returns the passed-in ball (callers
 * pass a fresh copy). Returns whether the ball dropped into the cup.
 */
export function stepBall(
  ball: MinigolfBall,
  course: MinigolfCourse,
  dtScale: number,
): { holed: boolean; inWater?: boolean } {
  let speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= 0) return { holed: false };

  const newSpeed = Math.max(0, speed * Math.pow(FRICTION_MULT, dtScale) - FRICTION_LINEAR * dtScale);
  if (newSpeed < STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    return { holed: false };
  }
  const scale = newSpeed / speed;
  ball.vx *= scale;
  ball.vy *= scale;
  speed = newSpeed;

  const travel = speed * dtScale;
  const steps = Math.max(1, Math.ceil(travel / (BALL_RADIUS * 0.75)));
  const stepDt = dtScale / steps;

  for (let i = 0; i < steps; i++) {
    ball.x += ball.vx * stepDt;
    ball.y += ball.vy * stepDt;

    // Resolve collisions; a corner can touch two rects in one substep.
    for (let pass = 0; pass < 3; pass++) {
      let hitAny = false;
      for (const wall of course.walls) {
        if (collideBallWithRect(ball, wall)) hitAny = true;
      }
      if (!hitAny) break;
    }

    const cupDist = Math.hypot(ball.x - course.cup.x, ball.y - course.cup.y);
    const currentSpeed = Math.hypot(ball.vx, ball.vy);
    if (cupDist < CUP_RADIUS && currentSpeed < CUP_CAPTURE_SPEED) {
      ball.x = course.cup.x;
      ball.y = course.cup.y;
      ball.vx = 0;
      ball.vy = 0;
      return { holed: true };
    }

    if (ballInAnyWater(ball, course.waterHazards ?? [])) {
      ball.vx = 0;
      ball.vy = 0;
      return { holed: false, inWater: true };
    }
  }

  return { holed: false };
}

export function strokeVelocity(angle: number, power: number): { vx: number; vy: number } {
  const clamped = Math.max(0.02, Math.min(1, power));
  const speed = MIN_STROKE_SPEED + clamped * (MAX_STROKE_SPEED - MIN_STROKE_SPEED);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

// ---------------------------------------------------------------------------
// Bot AI — simulate candidate strokes with the real physics and pick the best.
// ---------------------------------------------------------------------------

const BOT_SIM_MAX_TICKS = 260;
const BOT_ANGLE_OFFSETS = [0, 0.22, -0.22, 0.45, -0.45, 0.8, -0.8, 1.25, -1.25, 1.9, -1.9, 2.6, -2.6];
const BOT_POWERS = [0.28, 0.45, 0.62, 0.8, 1];

function simulateStroke(
  start: MinigolfBall,
  course: MinigolfCourse,
  angle: number,
  power: number,
): { holed: boolean; ticks: number; finalDist: number } {
  const { vx, vy } = strokeVelocity(angle, power);
  const ball: MinigolfBall = { x: start.x, y: start.y, vx, vy };
  for (let t = 0; t < BOT_SIM_MAX_TICKS; t++) {
    const { holed, inWater } = stepBall(ball, course, 1);
    if (holed) return { holed: true, ticks: t, finalDist: 0 };
    if (inWater) {
      return {
        holed: false,
        ticks: t,
        finalDist: Math.hypot(start.x - course.cup.x, start.y - course.cup.y) + 500,
      };
    }
    if (isBallAtRest(ball)) {
      return {
        holed: false,
        ticks: t,
        finalDist: Math.hypot(ball.x - course.cup.x, ball.y - course.cup.y),
      };
    }
  }
  return {
    holed: false,
    ticks: BOT_SIM_MAX_TICKS,
    finalDist: Math.hypot(ball.x - course.cup.x, ball.y - course.cup.y),
  };
}

export function chooseBotStroke(
  ball: MinigolfBall,
  course: MinigolfCourse,
  rng: Rng = Math.random,
): { angle: number; power: number } {
  const directAngle = Math.atan2(course.cup.y - ball.y, course.cup.x - ball.x);
  let best: { angle: number; power: number; holed: boolean; ticks: number; finalDist: number } | null = null;

  for (const offset of BOT_ANGLE_OFFSETS) {
    const angle = directAngle + offset;
    for (const power of BOT_POWERS) {
      const result = simulateStroke(ball, course, angle, power);
      if (
        !best ||
        (result.holed && !best.holed) ||
        (result.holed && best.holed && result.ticks < best.ticks) ||
        (!result.holed && !best.holed && result.finalDist < best.finalDist)
      ) {
        best = { angle, power, ...result };
      }
    }
  }

  const chosen = best ?? { angle: directAngle, power: 0.6 };
  // Imperfection: small aim/power noise so bots miss occasionally.
  return {
    angle: chosen.angle + (rng() - 0.5) * 0.06,
    power: Math.max(0.05, Math.min(1, chosen.power * (1 + (rng() - 0.5) * 0.08))),
  };
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function teePosition(course: MinigolfCourse, playerIndex: number): { x: number; y: number } {
  // Small deterministic scatter so resting balls at the tee don't fully overlap.
  const dx = ((playerIndex % 3) - 1) * 4;
  const dy = Math.floor(playerIndex / 3) * 4;
  return { x: course.tee.x + dx, y: course.tee.y + dy };
}

function giveUpScore(par: number): number {
  return par * 2;
}

function currentCourse(state: MinigolfState): MinigolfCourse {
  return state.courses[state.holeIndex];
}

function playerDone(p: MinigolfPlayer): boolean {
  return p.holed || p.gaveUp;
}

function withRecordedScore(p: MinigolfPlayer, holeIndex: number, score: number): MinigolfPlayer {
  const scores = [...p.scores];
  scores[holeIndex] = score;
  return { ...p, scores };
}

function allPlayersDone(players: MinigolfPlayer[]): boolean {
  return players.every(playerDone);
}

function beginSummaryIfDone(state: MinigolfState): MinigolfState {
  if (state.phase !== 'playing' || !allPlayersDone(state.players)) return state;
  return { ...state, phase: 'summary', summaryTicks: SUMMARY_TICKS };
}

function computeWinners(players: MinigolfPlayer[]): string[] {
  const totals = players.map((p) => ({
    id: p.id,
    total: p.scores.reduce((sum, s) => sum + s, 0),
  }));
  const min = Math.min(...totals.map((t) => t.total));
  return totals.filter((t) => t.total === min).map((t) => t.id);
}

function advanceHole(state: MinigolfState): MinigolfState {
  const nextIndex = state.holeIndex + 1;
  if (nextIndex >= state.courses.length) {
    return {
      ...state,
      phase: 'game-over',
      summaryTicks: 0,
      gameOver: true,
      winners: computeWinners(state.players),
    };
  }
  const course = state.courses[nextIndex];
  return {
    ...state,
    holeIndex: nextIndex,
    phase: 'playing',
    summaryTicks: 0,
    players: state.players.map((p, i) => ({
      ...p,
      ball: { ...teePosition(course, i), vx: 0, vy: 0 },
      strokes: 0,
      holed: false,
      gaveUp: false,
      botNextStrokeTick: -1,
      sinkTicks: 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

const BOT_MIN_DELAY_TICKS = Math.round(900 / MINIGOLF_TICK_MS);
const BOT_MAX_DELAY_TICKS = Math.round(2400 / MINIGOLF_TICK_MS);

function updatePlayerBeforePhysics(
  p: MinigolfPlayer,
  playerIndex: number,
  course: MinigolfCourse,
  holeIndex: number,
): { player: MinigolfPlayer; changed: boolean; needsPhysics: boolean } {
  if (playerDone(p)) return { player: p, changed: false, needsPhysics: false };

  if (p.sinkTicks > 0) {
    const remaining = p.sinkTicks - 1;
    if (remaining > 0) {
      return { player: { ...p, sinkTicks: remaining }, changed: true, needsPhysics: false };
    }
    const tee = teePosition(course, playerIndex);
    return {
      player: {
        ...p,
        ball: { x: tee.x, y: tee.y, vx: 0, vy: 0 },
        strokes: p.strokes + 1,
        sinkTicks: 0,
        botNextStrokeTick: -1,
      },
      changed: true,
      needsPhysics: false,
    };
  }

  if (isBallAtRest(p.ball)) {
    if (p.strokes >= course.par + STROKE_CAP_OVER_PAR) {
      return {
        player: withRecordedScore({ ...p, gaveUp: true }, holeIndex, giveUpScore(course.par)),
        changed: true,
        needsPhysics: false,
      };
    }

    if (p.isBot) {
      if (p.botNextStrokeTick < 0) {
        const delay = BOT_MIN_DELAY_TICKS + Math.floor(Math.random() * (BOT_MAX_DELAY_TICKS - BOT_MIN_DELAY_TICKS));
        return { player: { ...p, botNextStrokeTick: delay }, changed: true, needsPhysics: false };
      }
      if (p.botNextStrokeTick > 0) {
        return { player: { ...p, botNextStrokeTick: p.botNextStrokeTick - 1 }, changed: true, needsPhysics: false };
      }
      const { angle, power } = chooseBotStroke(p.ball, course);
      const { vx, vy } = strokeVelocity(angle, power);
      return {
        player: {
          ...p,
          ball: { ...p.ball, vx, vy },
          strokes: p.strokes + 1,
          botNextStrokeTick: -1,
        },
        changed: true,
        needsPhysics: true,
      };
    }

    return { player: p, changed: false, needsPhysics: false };
  }

  return { player: p, changed: true, needsPhysics: true };
}

function applyBallPhysicsResult(
  p: MinigolfPlayer,
  ball: MinigolfBall,
  course: MinigolfCourse,
  holeIndex: number,
  result: { holed: boolean; inWater?: boolean },
): MinigolfPlayer {
  if (result.inWater) {
    return { ...p, ball, sinkTicks: SINK_TICKS, botNextStrokeTick: -1 };
  }
  if (result.holed) {
    return withRecordedScore({ ...p, ball, holed: true }, holeIndex, p.strokes);
  }
  if (isBallAtRest(ball) && p.strokes >= course.par + STROKE_CAP_OVER_PAR) {
    return withRecordedScore({ ...p, ball, gaveUp: true }, holeIndex, giveUpScore(course.par));
  }
  return { ...p, ball };
}

function ballChanged(before: MinigolfBall, after: MinigolfBall): boolean {
  return before.x !== after.x || before.y !== after.y || before.vx !== after.vx || before.vy !== after.vy;
}

function processTickWithCollisions(state: MinigolfState, course: MinigolfCourse, dtScale: number): MinigolfState {
  let anyChange = false;
  const prePhysics = state.players.map((p, i) => {
    const result = updatePlayerBeforePhysics(p, i, course, state.holeIndex);
    if (result.changed) anyChange = true;
    return result;
  });
  let players = prePhysics.map((r) => r.player);

  const activeIndices: number[] = [];
  for (let i = 0; i < players.length; i++) {
    if (!playerDone(players[i]) && players[i].sinkTicks === 0) {
      activeIndices.push(i);
    }
  }

  if (activeIndices.length > 0) {
    const balls = activeIndices.map((i) => ({ ...players[i].ball }));
    const beforeBalls = activeIndices.map((i) => players[i].ball);
    const results = stepBallsWithCollisions(balls, course, dtScale);

    for (let j = 0; j < activeIndices.length; j++) {
      const i = activeIndices[j];
      const p = players[i];
      const ball = balls[j];
      const result = results[j];
      if (result.inWater || result.holed || ballChanged(beforeBalls[j], ball)) {
        players[i] = applyBallPhysicsResult(p, ball, course, state.holeIndex, result);
        anyChange = true;
      }
    }
  }

  if (!anyChange) return state;

  let next: MinigolfState = { ...state, players, lastTickAt: Date.now() };
  next = beginSummaryIfDone(next);
  return next;
}

function processTickWithoutCollisions(state: MinigolfState, course: MinigolfCourse, dtScale: number): MinigolfState {
  let anyChange = false;

  const players = state.players.map((p, playerIndex) => {
    const { player, changed, needsPhysics } = updatePlayerBeforePhysics(p, playerIndex, course, state.holeIndex);
    if (changed) anyChange = true;
    if (!needsPhysics) return player;

    anyChange = true;
    const ball: MinigolfBall = { ...player.ball };
    const result = stepBall(ball, course, dtScale);
    return applyBallPhysicsResult(player, ball, course, state.holeIndex, result);
  });

  if (!anyChange) return state;

  let next: MinigolfState = { ...state, players, lastTickAt: Date.now() };
  next = beginSummaryIfDone(next);
  return next;
}

function processTick(state: MinigolfState, dt: number): MinigolfState {
  if (state.gameOver) return state;
  const dtScale = dt / MINIGOLF_TICK_MS;

  if (state.phase === 'summary') {
    const remaining = state.summaryTicks - 1;
    if (remaining > 0) {
      return { ...state, summaryTicks: remaining, lastTickAt: Date.now() };
    }
    return { ...advanceHole(state), lastTickAt: Date.now() };
  }

  const course = currentCourse(state);
  if (state.ballCollisions) {
    return processTickWithCollisions(state, course, dtScale);
  }
  return processTickWithoutCollisions(state, course, dtScale);
}

// ---------------------------------------------------------------------------
// Required engine exports
// ---------------------------------------------------------------------------

export function createMinigolfState(players: Player[], options?: GameStartOptions): MinigolfState {
  const courses = generateCourses(HOLES_PER_GAME);
  const gamePlayers: MinigolfPlayer[] = players.slice(0, 8).map((p, i) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: p.isBot,
    ball: { ...teePosition(courses[0], i), vx: 0, vy: 0 },
    strokes: 0,
    holed: false,
    gaveUp: false,
    scores: [],
    botNextStrokeTick: -1,
    sinkTicks: 0,
  }));

  return {
    players: gamePlayers,
    ballCollisions: options?.minigolfBallCollisions ?? false,
    courses,
    holeIndex: 0,
    phase: 'playing',
    summaryTicks: 0,
    gameOver: false,
    winners: [],
    lastTickAt: Date.now(),
  };
}

export function processMinigolfAction(state: unknown, action: unknown, playerId: string): unknown {
  const s = state as MinigolfState;
  const a = action as MinigolfAction;

  if (!a || typeof a !== 'object' || !('type' in a)) return state;

  switch (a.type) {
    case 'stroke': {
      if (s.gameOver || s.phase !== 'playing') return state;
      const idx = s.players.findIndex((p) => p.id === playerId);
      if (idx === -1) return state;
      const player = s.players[idx];
      if (playerDone(player) || !isBallAtRest(player.ball) || player.sinkTicks > 0) return state;
      if (typeof a.angle !== 'number' || !Number.isFinite(a.angle)) return state;
      if (typeof a.power !== 'number' || !Number.isFinite(a.power) || a.power <= 0) return state;

      const { vx, vy } = strokeVelocity(a.angle, Math.min(1, a.power));
      const players = s.players.map((p, i) =>
        i === idx
          ? { ...p, ball: { ...p.ball, vx, vy }, strokes: p.strokes + 1 }
          : p,
      );
      return { ...s, players };
    }
    case 'next-hole': {
      if (playerId !== '' && playerId != null) return state;
      if (s.phase !== 'summary') return state;
      return advanceHole(s);
    }
    case 'tick': {
      if (playerId !== '' && playerId != null) return state;
      return processTick(s, a.dt);
    }
    default:
      return state;
  }
}

export function isMinigolfOver(state: unknown): boolean {
  return (state as MinigolfState).gameOver;
}

export function runMinigolfBotTurn(state: unknown): unknown {
  // Bots act inside the host physics tick, like pong.
  return state;
}

export function getMinigolfWinners(state: unknown): string[] {
  return (state as MinigolfState).winners;
}
