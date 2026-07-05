import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '../../networking/types';
import {
  COURSE_H,
  COURSE_W,
  LANDMINE_COUNT_MAX,
  LANDMINE_COUNT_MIN,
  WALL_THICKNESS,
  generateCourses,
  generateHole,
  pathLengthCells,
  type Rng,
} from './courseGen';
import {
  CUP_CAPTURE_SPEED,
  STROKE_CAP_OVER_PAR,
  SUMMARY_TICKS,
  SINK_TICKS,
  chooseBotStroke,
  createMinigolfState,
  getMinigolfWinners,
  isBallAtRest,
  isMinigolfOver,
  processMinigolfAction,
  runMinigolfBotTurn,
  stepBall,
  strokeVelocity,
} from './logic';
import type { MinigolfBall, MinigolfCourse, MinigolfPlayer, MinigolfState } from './types';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color: 'blue' as const,
    isBot: false,
    isHost: i === 0,
    connected: true,
  }));
}

function openCourse(par = 2, theme: MinigolfCourse['theme'] = 'classic'): MinigolfCourse {
  return {
    walls: [
      { x: 0, y: 0, w: COURSE_W, h: WALL_THICKNESS },
      { x: 0, y: COURSE_H - WALL_THICKNESS, w: COURSE_W, h: WALL_THICKNESS },
      { x: 0, y: 0, w: WALL_THICKNESS, h: COURSE_H },
      { x: COURSE_W - WALL_THICKNESS, y: 0, w: WALL_THICKNESS, h: COURSE_H },
    ],
    waterHazards: [],
    tee: { x: 50, y: COURSE_H - 18 },
    cup: { x: 50, y: 18 },
    par,
    theme,
  };
}

function courseWithWater(water: MinigolfCourse['waterHazards'], par = 2): MinigolfCourse {
  return { ...openCourse(par), waterHazards: water };
}

function courseWithIce(ice: MinigolfCourse['waterHazards'], par = 2): MinigolfCourse {
  return { ...openCourse(par, 'tundra'), waterHazards: ice };
}

function makeState(playerCount = 2, par = 2): MinigolfState {
  const course = openCourse(par);
  const state = createMinigolfState(makePlayers(playerCount));
  return { ...state, courses: [course, openCourse(par), openCourse(par)] };
}

function tick(state: MinigolfState): MinigolfState {
  return processMinigolfAction(state, { type: 'tick', dt: 33 }, '') as MinigolfState;
}

function tickUntilRest(state: MinigolfState, playerId: string, maxTicks = 500): MinigolfState {
  let s = state;
  for (let i = 0; i < maxTicks; i++) {
    const p = s.players.find((pl) => pl.id === playerId)!;
    if (isBallAtRest(p.ball) || p.holed) return s;
    s = tick(s);
  }
  return s;
}

describe('minigolf course generation', () => {
  it('generates reachable holes with sane pars', () => {
    for (let i = 0; i < 50; i++) {
      const hole = generateHole();
      expect(hole.par).toBeGreaterThanOrEqual(2);
      expect(hole.par).toBeLessThanOrEqual(5);
      expect(hole.tee.x).toBeGreaterThan(WALL_THICKNESS);
      expect(hole.tee.x).toBeLessThan(COURSE_W - WALL_THICKNESS);
      expect(hole.cup.y).toBeLessThan(COURSE_H / 2);
      expect(hole.tee.y).toBeGreaterThan(COURSE_H / 2);
      expect(pathLengthCells(hole.walls, hole.tee, hole.cup)).not.toBeNull();
    }
  });

  it('creates a game with 9 holes by default and players at the tee', () => {
    const state = createMinigolfState(makePlayers(3));
    expect(state.courses).toHaveLength(9);
    expect(state.holeIndex).toBe(0);
    expect(state.phase).toBe('playing');
    expect(state.ballCollisions).toBe(false);
    expect(state.obstacles).toBe(false);
    expect(state.triggeredLandmines).toEqual([]);
    for (const p of state.players) {
      expect(p.strokes).toBe(0);
      expect(p.holed).toBe(false);
      expect(p.sinkTicks).toBe(0);
      expect(isBallAtRest(p.ball)).toBe(true);
      expect(Math.hypot(p.ball.x - state.courses[0].tee.x, p.ball.y - state.courses[0].tee.y)).toBeLessThan(10);
    }
  });

  it('respects the ball collisions start option', () => {
    expect(createMinigolfState(makePlayers(2)).ballCollisions).toBe(false);
    expect(createMinigolfState(makePlayers(2), { minigolfBallCollisions: true }).ballCollisions).toBe(true);
  });

  it('respects the obstacles start option', () => {
    expect(createMinigolfState(makePlayers(2)).obstacles).toBe(false);
    expect(createMinigolfState(makePlayers(2)).courses.every((c) => !c.landmines?.length)).toBe(true);
    const withObstacles = createMinigolfState(makePlayers(2), { minigolfObstacles: true });
    expect(withObstacles.obstacles).toBe(true);
    expect(withObstacles.triggeredLandmines).toEqual([]);
    for (const course of withObstacles.courses) {
      const count = course.landmines?.length ?? 0;
      expect(count).toBeGreaterThanOrEqual(LANDMINE_COUNT_MIN);
      expect(count).toBeLessThanOrEqual(LANDMINE_COUNT_MAX);
    }
  });

  it('places landmines clear of tee and cup when obstacles are enabled', () => {
    for (let i = 0; i < 30; i++) {
      const hole = generateHole(Math.random, 'classic', true);
      if (!hole.landmines?.length) continue;
      for (const lm of hole.landmines) {
        expect(Math.hypot(lm.x - hole.tee.x, lm.y - hole.tee.y)).toBeGreaterThanOrEqual(9);
        expect(Math.hypot(lm.x - hole.cup.x, lm.y - hole.cup.y)).toBeGreaterThanOrEqual(9);
      }
    }
  });

  it('respects the minigolfHoleCount start option', () => {
    expect(createMinigolfState(makePlayers(2)).courses).toHaveLength(9);
    expect(createMinigolfState(makePlayers(2), { minigolfHoleCount: 3 }).courses).toHaveLength(3);
    expect(createMinigolfState(makePlayers(2), { minigolfHoleCount: 18 }).courses).toHaveLength(18);
  });

  it('defaults to classic theme and respects minigolfTheme option', () => {
    expect(createMinigolfState(makePlayers(2)).courses.every((c) => c.theme === 'classic')).toBe(true);
    expect(
      createMinigolfState(makePlayers(2), { minigolfTheme: 'classic' }).courses.every((c) => c.theme === 'classic'),
    ).toBe(true);
    const randomState = createMinigolfState(makePlayers(2), { minigolfTheme: 'random' });
    expect(randomState.courses.length).toBeGreaterThan(0);
    for (const course of randomState.courses) {
      expect(['classic', 'desert', 'tundra', 'chocolate', 'cemetery', 'jungle']).toContain(course.theme);
    }
  });

  it('random theme assigns a theme per hole', () => {
    const seededRng = (seed: number): Rng => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    };
    const courses = generateCourses(3, seededRng(42), 'random');
    expect(courses).toHaveLength(3);
    for (const course of courses) {
      expect(['classic', 'desert', 'tundra', 'chocolate', 'cemetery', 'jungle']).toContain(course.theme);
    }
    const themes = new Set(courses.map((c) => c.theme));
    expect(themes.size).toBeGreaterThan(1);
  });

  it('generates desert sand traps on some holes', () => {
    const seededRng = (seed: number): Rng => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    };
    let withSandTraps = 0;
    for (let i = 0; i < 50; i++) {
      const hole = generateHole(seededRng(i * 9973 + 1), 'desert');
      if ((hole.sandTraps?.length ?? 0) > 0) withSandTraps++;
    }
    expect(withSandTraps).toBeGreaterThan(0);
  });

  it('sometimes generates water hazards on reachable holes', () => {
    let withWater = 0;
    for (let i = 0; i < 50; i++) {
      const hole = generateHole();
      expect(pathLengthCells(hole.walls, hole.tee, hole.cup)).not.toBeNull();
      if (hole.waterHazards.length > 0) withWater++;
    }
    expect(withWater).toBeGreaterThan(0);
  });
});

describe('minigolf strokes', () => {
  it('applies a valid stroke and counts it', () => {
    const state = makeState();
    const next = processMinigolfAction(state, { type: 'stroke', angle: -Math.PI / 2, power: 0.5 }, 'p1') as MinigolfState;
    const p1 = next.players.find((p) => p.id === 'p1')!;
    expect(p1.strokes).toBe(1);
    expect(isBallAtRest(p1.ball)).toBe(false);
    expect(p1.ball.vy).toBeLessThan(0);
  });

  it('rejects a stroke while the ball is moving', () => {
    let state = makeState();
    state = processMinigolfAction(state, { type: 'stroke', angle: 0, power: 0.5 }, 'p1') as MinigolfState;
    const again = processMinigolfAction(state, { type: 'stroke', angle: 0, power: 0.5 }, 'p1');
    expect(again).toBe(state);
  });

  it('rejects strokes from unknown players and bad payloads', () => {
    const state = makeState();
    expect(processMinigolfAction(state, { type: 'stroke', angle: 0, power: 0.5 }, 'nobody')).toBe(state);
    expect(processMinigolfAction(state, { type: 'stroke', angle: NaN, power: 0.5 }, 'p1')).toBe(state);
    expect(processMinigolfAction(state, { type: 'stroke', angle: 0, power: 0 }, 'p1')).toBe(state);
  });

  it('rejects strokes after the player has holed out', () => {
    const state = makeState();
    const players = state.players.map((p) =>
      p.id === 'p1' ? { ...p, holed: true, scores: [2] } : p,
    );
    const holedState = { ...state, players };
    expect(processMinigolfAction(holedState, { type: 'stroke', angle: 0, power: 0.5 }, 'p1')).toBe(holedState);
  });
});

describe('minigolf physics', () => {
  it('bounces off walls and stays in bounds', () => {
    const course = openCourse();
    const ball: MinigolfBall = { x: 50, y: 60, vx: -3, vy: 0 };
    let bounced = false;
    for (let i = 0; i < 400; i++) {
      stepBall(ball, course, 1);
      if (ball.vx > 0) bounced = true;
      if (isBallAtRest(ball)) break;
    }
    expect(bounced).toBe(true);
    expect(ball.x).toBeGreaterThan(WALL_THICKNESS);
    expect(ball.x).toBeLessThan(COURSE_W - WALL_THICKNESS);
    expect(isBallAtRest(ball)).toBe(true);
  });

  it('captures a slow ball rolling over the cup', () => {
    const course = openCourse();
    const ball: MinigolfBall = { x: course.cup.x, y: course.cup.y + 10, vx: 0, vy: -1 };
    let holed = false;
    for (let i = 0; i < 200 && !holed; i++) {
      holed = stepBall(ball, course, 1).holed;
    }
    expect(holed).toBe(true);
    expect(ball.x).toBe(course.cup.x);
    expect(ball.y).toBe(course.cup.y);
  });

  it('does not capture a ball moving too fast over the cup', () => {
    const course = openCourse();
    const ball: MinigolfBall = { x: course.cup.x, y: course.cup.y + 4, vx: 0, vy: -(CUP_CAPTURE_SPEED + 1.2) };
    let holed = stepBall(ball, course, 1).holed;
    holed = holed || stepBall(ball, course, 1).holed;
    expect(holed).toBe(false);
    expect(ball.y).toBeLessThan(course.cup.y);
  });

  it('records the stroke count as score when a player holes out via tick', () => {
    let state = makeState(1);
    const course = state.courses[0];
    const players = state.players.map((p) => ({
      ...p,
      ball: { x: course.cup.x, y: course.cup.y + 8, vx: 0, vy: 0 },
      strokes: 2,
    }));
    state = { ...state, players };
    state = processMinigolfAction(state, { type: 'stroke', angle: -Math.PI / 2, power: 0.15 }, 'p1') as MinigolfState;
    state = tickUntilRest(state, 'p1');
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p1.holed).toBe(true);
    expect(p1.scores[0]).toBe(3);
  });

  function twoBallCollisionState(ballCollisions: boolean): MinigolfState {
    const course = openCourse();
    const state = createMinigolfState(makePlayers(2), { minigolfBallCollisions: ballCollisions });
    return {
      ...state,
      ballCollisions,
      courses: [course, openCourse(), openCourse()],
      players: state.players.map((p, i) =>
        i === 0
          ? { ...p, ball: { x: 40, y: 50, vx: 3, vy: 0 } }
          : { ...p, ball: { x: 44, y: 50, vx: 0, vy: 0 } },
      ),
    };
  }

  it('bounces balls off each other when collisions are enabled', () => {
    let state = twoBallCollisionState(true);
    state = tick(state);
    const p1 = state.players.find((p) => p.id === 'p1')!;
    const p2 = state.players.find((p) => p.id === 'p2')!;
    expect(p2.ball.vx).toBeGreaterThan(0);
    expect(p1.ball.vx).toBeLessThan(3);
  });

  it('lets balls pass through each other when collisions are disabled', () => {
    let state = twoBallCollisionState(false);
    state = tick(state);
    const p1 = state.players.find((p) => p.id === 'p1')!;
    const p2 = state.players.find((p) => p.id === 'p2')!;
    expect(p2.ball.vx).toBe(0);
    expect(p2.ball.vy).toBe(0);
    expect(p1.ball.vx).toBeGreaterThan(0);
  });

  it('does not collide with balls still in the starting area', () => {
    const course = openCourse();
    const state = createMinigolfState(makePlayers(2), { minigolfBallCollisions: true });
    const tee = course.tee;
    let s: MinigolfState = {
      ...state,
      ballCollisions: true,
      courses: [course, openCourse(), openCourse()],
      players: state.players.map((p, i) =>
        i === 0
          ? { ...p, ball: { x: tee.x - 4, y: tee.y, vx: 2, vy: 0 } }
          : { ...p, ball: { x: tee.x + 4, y: tee.y, vx: 0, vy: 0 } },
      ),
    };
    s = tick(s);
    const p2 = s.players.find((p) => p.id === 'p2')!;
    expect(p2.ball.vx).toBe(0);
    expect(p2.ball.vy).toBe(0);
  });

  it('tundra balls slide farther than desert balls on the same stroke', () => {
    const course = openCourse();
    const start: MinigolfBall = { x: 50, y: 100, vx: 0, vy: -3 };
    const desertBall = { ...start };
    const tundraBall = { ...start };
    for (let i = 0; i < 80; i++) {
      if (!isBallAtRest(desertBall)) stepBall(desertBall, course, 1, 'desert');
      if (!isBallAtRest(tundraBall)) stepBall(tundraBall, course, 1, 'tundra');
    }
    expect(tundraBall.y).toBeLessThan(desertBall.y);
  });

  it('sand traps slow the ball without sinking it', () => {
    const course: MinigolfCourse = {
      ...openCourse(),
      sandTraps: [{ x: 40, y: 55, w: 20, h: 30 }],
    };
    const inTrap: MinigolfBall = { x: 50, y: 70, vx: 0, vy: -2 };
    let inWater = false;
    for (let i = 0; i < 30; i++) {
      const result = stepBall(inTrap, course, 1, 'desert');
      if (result.inWater) inWater = true;
      if (isBallAtRest(inTrap)) break;
    }
    expect(inWater).toBe(false);

    const onFairway: MinigolfBall = { x: 50, y: 70, vx: 0, vy: -2 };
    for (let i = 0; i < 30; i++) {
      stepBall(onFairway, openCourse(), 1, 'desert');
      if (isBallAtRest(onFairway)) break;
    }
    const trapSpeed = Math.hypot(inTrap.vx, inTrap.vy);
    const fairwaySpeed = Math.hypot(onFairway.vx, onFairway.vy);
    expect(trapSpeed).toBeLessThan(fairwaySpeed);
  });

  it('knocks the ball away when it enters obstacle trigger range', () => {
    const course: MinigolfCourse = { ...openCourse(), landmines: [{ x: 50, y: 70 }] };
    const ball: MinigolfBall = { x: 50, y: 63, vx: 0, vy: 2 };
    const triggered = new Set<number>();
    stepBall(ball, course, 1, 'classic', triggered);
    expect(triggered.has(0)).toBe(true);
    expect(Math.hypot(ball.vx, ball.vy)).toBeGreaterThan(2);
    expect(ball.vy).toBeLessThan(0);
  });

  it('does not retrigger detonated obstacles', () => {
    const course: MinigolfCourse = { ...openCourse(), landmines: [{ x: 50, y: 70 }] };
    const ball: MinigolfBall = { x: 50, y: 63, vx: 0, vy: 2 };
    const triggered = new Set([0]);
    stepBall(ball, course, 1, 'classic', triggered);
    expect(triggered.size).toBe(1);
  });

  it('detonates obstacles and knocks back all balls in explosion range', () => {
    const course: MinigolfCourse = { ...openCourse(), landmines: [{ x: 50, y: 70 }] };
    const base = createMinigolfState(makePlayers(2), { minigolfBallCollisions: true, minigolfObstacles: true });
    let state: MinigolfState = {
      ...base,
      ballCollisions: true,
      obstacles: true,
      courses: [course],
      triggeredLandmines: [],
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, ball: { x: 50, y: 63, vx: 0, vy: 2 } }
          : { ...p, ball: { x: 57, y: 70, vx: 0, vy: 0 } },
      ),
    };
    const beforeB = { ...state.players[1].ball };
    state = tick(state);
    expect(state.triggeredLandmines).toContain(0);
    expect(Math.hypot(state.players[0].ball.vx, state.players[0].ball.vy)).toBeGreaterThan(0);
    const afterB = state.players[1].ball;
    expect(
      afterB.vx !== beforeB.vx || afterB.vy !== beforeB.vy || afterB.x !== beforeB.x || afterB.y !== beforeB.y,
    ).toBe(true);
  });
});

describe('minigolf water hazards', () => {
  it('detects when the ball center enters water and stops it', () => {
    const water = [{ x: 40, y: 60, w: 20, h: 15 }];
    const course = courseWithWater(water);
    const ball: MinigolfBall = { x: 50, y: 58, vx: 0, vy: 3 };
    const result = stepBall(ball, course, 1);
    expect(result.inWater).toBe(true);
    expect(result.holed).toBe(false);
    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(0);
  });

  it('does not trigger water when the ball passes over the edge', () => {
    const water = [{ x: 40, y: 60, w: 20, h: 15 }];
    const course = courseWithWater(water);
    const ball: MinigolfBall = { x: 35, y: 58, vx: 0, vy: 1 };
    let inWater = false;
    for (let i = 0; i < 20 && !inWater; i++) {
      inWater = stepBall(ball, course, 1).inWater === true;
    }
    expect(inWater).toBe(false);
  });

  it('sinks then resets to last stroke position with a +1 stroke penalty', () => {
    const water = [{ x: 40, y: 60, w: 20, h: 15 }];
    const course = courseWithWater(water);
    let state = makeState(1);
    const lastStrokePos = { x: course.tee.x, y: course.tee.y };
    state = {
      ...state,
      courses: [course, ...state.courses.slice(1)],
      players: state.players.map((p) =>
        p.id === 'p1'
          ? {
              ...p,
              ball: { x: 50, y: 65, vx: 0, vy: 0 },
              lastStrokePos,
              strokes: 1,
              sinkTicks: SINK_TICKS,
            }
          : p,
      ),
    };

    for (let i = 0; i < SINK_TICKS; i++) {
      state = tick(state);
    }
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p1.sinkTicks).toBe(0);
    expect(isBallAtRest(p1.ball)).toBe(true);
    expect(p1.strokes).toBe(2);
    expect(p1.ball.x).toBe(lastStrokePos.x);
    expect(p1.ball.y).toBe(lastStrokePos.y);
  });

  it('respawns away from the tee when the last stroke was not from the tee', () => {
    const water = [{ x: 40, y: 60, w: 20, h: 15 }];
    const course = courseWithWater(water);
    const lastStrokePos = { x: 30, y: 40 };
    let state = makeState(1);
    state = {
      ...state,
      courses: [course, ...state.courses.slice(1)],
      players: state.players.map((p) =>
        p.id === 'p1'
          ? {
              ...p,
              ball: { x: 50, y: 65, vx: 0, vy: 0 },
              lastStrokePos,
              strokes: 2,
              sinkTicks: SINK_TICKS,
            }
          : p,
      ),
    };

    for (let i = 0; i < SINK_TICKS; i++) {
      state = tick(state);
    }
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p1.ball.x).toBe(lastStrokePos.x);
    expect(p1.ball.y).toBe(lastStrokePos.y);
    expect(Math.hypot(p1.ball.x - course.tee.x, p1.ball.y - course.tee.y)).toBeGreaterThan(10);
  });

  it('records last stroke position when the player hits the ball', () => {
    const water = [{ x: 40, y: 60, w: 20, h: 15 }];
    const course = courseWithWater(water);
    let state = makeState(1);
    state = {
      ...state,
      courses: [course, ...state.courses.slice(1)],
      players: state.players.map((p) =>
        p.id === 'p1'
          ? {
              ...p,
              ball: { x: 30, y: 40, vx: 0, vy: 0 },
              lastStrokePos: { x: course.tee.x, y: course.tee.y },
            }
          : p,
      ),
    };

    state = processMinigolfAction(state, { type: 'stroke', angle: -Math.PI / 2, power: 0.5 }, 'p1') as MinigolfState;
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p1.lastStrokePos).toEqual({ x: 30, y: 40 });
  });
});

describe('minigolf tundra ice hazards', () => {
  it('does not sink the ball or stop it when center enters ice', () => {
    const ice = [{ x: 40, y: 60, w: 20, h: 15 }];
    const course = courseWithIce(ice);
    const ball: MinigolfBall = { x: 50, y: 65, vx: 0, vy: 3 };
    const result = stepBall(ball, course, 1, 'tundra');
    expect(result.inWater).toBeUndefined();
    expect(result.holed).toBe(false);
    expect(ball.vy).toBeGreaterThan(0);
  });

  it('retains more speed on ice than on fairway over multiple ticks', () => {
    const ice = [{ x: 40, y: 60, w: 20, h: 15 }];
    const course = courseWithIce(ice);
    const onIce: MinigolfBall = { x: 50, y: 65, vx: 0, vy: -2 };
    const onFairway: MinigolfBall = { x: 50, y: 70, vx: 0, vy: -2 };
    for (let i = 0; i < 10; i++) {
      stepBall(onIce, course, 1, 'tundra');
      stepBall(onFairway, openCourse(2, 'tundra'), 1, 'tundra');
    }
    const iceSpeed = Math.hypot(onIce.vx, onIce.vy);
    const fairwaySpeed = Math.hypot(onFairway.vx, onFairway.vy);
    expect(iceSpeed).toBeGreaterThan(fairwaySpeed);
  });
});

describe('minigolf stroke cap', () => {
  it('auto-applies double par at the stroke cap', () => {
    let state = makeState(1, 2);
    const cap = 2 + STROKE_CAP_OVER_PAR;
    const players = state.players.map((p) => ({ ...p, strokes: cap }));
    state = { ...state, players };
    state = tick(state);
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p1.gaveUp).toBe(true);
    expect(p1.scores[0]).toBe(4);
  });
});

describe('minigolf hole advancement and winners', () => {
  function finishedPlayers(state: MinigolfState, scores: Record<string, number>): MinigolfPlayer[] {
    return state.players.map((p) => ({
      ...p,
      holed: true,
      strokes: scores[p.id],
      scores: [...p.scores.slice(0, state.holeIndex), scores[p.id]],
    }));
  }

  it('advances to the next hole after the summary countdown', () => {
    let state = makeState(2);
    state = {
      ...state,
      phase: 'summary',
      summaryTicks: 2,
      players: finishedPlayers(state, { p1: 2, p2: 4 }),
    };
    state = tick(state);
    expect(state.phase).toBe('summary');
    state = tick(state);
    expect(state.holeIndex).toBe(1);
    expect(state.phase).toBe('playing');
    for (const p of state.players) {
      expect(p.strokes).toBe(0);
      expect(p.holed).toBe(false);
      expect(p.gaveUp).toBe(false);
      expect(p.scores).toHaveLength(1);
    }
  });

  it('only the host may advance the hole', () => {
    let state = makeState(2);
    state = { ...state, phase: 'summary', summaryTicks: SUMMARY_TICKS };
    expect(processMinigolfAction(state, { type: 'next-hole' }, 'p1')).toBe(state);
    const advanced = processMinigolfAction(state, { type: 'next-hole' }, '') as MinigolfState;
    expect(advanced.holeIndex).toBe(1);
  });

  it('ends the game after the final hole with lowest total winning', () => {
    let state = makeState(2);
    state = {
      ...state,
      holeIndex: 2,
      phase: 'summary',
      summaryTicks: 1,
      players: state.players.map((p) => ({
        ...p,
        holed: true,
        scores: p.id === 'p1' ? [2, 3, 2] : [3, 3, 4],
      })),
    };
    state = tick(state);
    expect(state.gameOver).toBe(true);
    expect(isMinigolfOver(state)).toBe(true);
    expect(getMinigolfWinners(state)).toEqual(['p1']);
  });

  it('allows ties for the win', () => {
    let state = makeState(2);
    state = {
      ...state,
      holeIndex: 2,
      phase: 'summary',
      summaryTicks: 1,
      players: state.players.map((p) => ({ ...p, holed: true, scores: [3, 3, 3] })),
    };
    state = tick(state);
    expect(getMinigolfWinners(state).sort()).toEqual(['p1', 'p2']);
  });
});

describe('minigolf dev regenerate hole', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks a random theme for the regenerated hole', () => {
    let state = makeState(2);
    state = {
      ...state,
      courses: state.courses.map((course, i) =>
        i === 1 ? { ...course, theme: 'classic' as const } : course,
      ),
      holeIndex: 1,
    };

    let call = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      call++;
      return call === 1 ? 0.4 : 0.5;
    });

    const next = processMinigolfAction(state, { type: 'dev-regenerate-hole' }, 'p1') as MinigolfState;

    expect(next.courses[1].theme).toBe('tundra');
  });

  it('replaces the current hole and resets players while preserving prior hole scores', () => {
    let state = makeState(2);
    const priorCourse = state.courses[1];
    state = {
      ...state,
      holeIndex: 1,
      players: state.players.map((p) => ({
        ...p,
        strokes: 4,
        holed: false,
        ball: { x: 60, y: 80, vx: 1.2, vy: 0 },
        scores: [3],
      })),
    };

    const next = processMinigolfAction(state, { type: 'dev-regenerate-hole' }, 'p1') as MinigolfState;

    expect(next.holeIndex).toBe(1);
    expect(next.phase).toBe('playing');
    expect(next.summaryTicks).toBe(0);
    expect(next.courses[1]).not.toBe(priorCourse);
    for (const p of next.players) {
      expect(p.strokes).toBe(0);
      expect(p.holed).toBe(false);
      expect(p.gaveUp).toBe(false);
      expect(p.scores).toEqual([3]);
      expect(p.ball.vx).toBe(0);
      expect(p.ball.vy).toBe(0);
    }
  });

  it('clears the current hole score when triggered during summary', () => {
    let state = makeState(2);
    state = {
      ...state,
      holeIndex: 1,
      phase: 'summary',
      summaryTicks: SUMMARY_TICKS,
      players: state.players.map((p) => ({
        ...p,
        holed: true,
        strokes: 2,
        scores: [3, 2],
      })),
    };

    const next = processMinigolfAction(state, { type: 'dev-regenerate-hole' }, 'p1') as MinigolfState;

    expect(next.phase).toBe('playing');
    for (const p of next.players) {
      expect(p.scores).toEqual([3]);
      expect(p.strokes).toBe(0);
      expect(p.holed).toBe(false);
    }
  });

  it('is a no-op when the game is over', () => {
    let state = makeState(2);
    state = { ...state, gameOver: true, phase: 'game-over' as const };
    expect(processMinigolfAction(state, { type: 'dev-regenerate-hole' }, 'p1')).toBe(state);
  });
});

describe('minigolf bots', () => {
  it('runBotTurn is a no-op (bots act inside the tick)', () => {
    const state = makeState(1);
    expect(runMinigolfBotTurn(state)).toBe(state);
  });

  it('chooses a stroke that moves the ball closer to the cup', () => {
    const course = openCourse();
    const start: MinigolfBall = { x: course.tee.x, y: course.tee.y, vx: 0, vy: 0 };
    const initialDist = Math.hypot(start.x - course.cup.x, start.y - course.cup.y);
    const { angle, power } = chooseBotStroke(start, course, 'classic', () => 0.5);
    expect(Number.isFinite(angle)).toBe(true);
    expect(power).toBeGreaterThan(0);
    expect(power).toBeLessThanOrEqual(1);

    const { vx, vy } = strokeVelocity(angle, power);
    const ball: MinigolfBall = { ...start, vx, vy };
    let holed = false;
    for (let i = 0; i < 400 && !holed && !isBallAtRest(ball); i++) {
      holed = stepBall(ball, course, 1).holed;
    }
    const finalDist = Math.hypot(ball.x - course.cup.x, ball.y - course.cup.y);
    expect(holed || finalDist < initialDist).toBe(true);
  });

  it('bot strokes are driven by the host tick', () => {
    let state = makeState(1);
    state = {
      ...state,
      players: state.players.map((p) => ({ ...p, isBot: true })),
    };
    // First tick schedules, subsequent ticks count down to the stroke.
    for (let i = 0; i < 200; i++) {
      state = tick(state);
      const bot = state.players[0];
      if (bot.strokes > 0) break;
    }
    expect(state.players[0].strokes).toBeGreaterThan(0);
  });
});
