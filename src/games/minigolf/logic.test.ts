import type { Player } from '../../networking/types';
import {
  COURSE_H,
  COURSE_W,
  WALL_THICKNESS,
  generateHole,
  pathLengthCells,
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

function openCourse(par = 2): MinigolfCourse {
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
  };
}

function courseWithWater(water: MinigolfCourse['waterHazards'], par = 2): MinigolfCourse {
  return { ...openCourse(par), waterHazards: water };
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

  it('creates a game with 3 holes and players at the tee', () => {
    const state = createMinigolfState(makePlayers(3));
    expect(state.courses).toHaveLength(3);
    expect(state.holeIndex).toBe(0);
    expect(state.phase).toBe('playing');
    expect(state.ballCollisions).toBe(false);
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

  it('sinks then resets to tee with a +1 stroke penalty', () => {
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
              ball: { x: 50, y: 65, vx: 0, vy: 0 },
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
    expect(Math.hypot(p1.ball.x - course.tee.x, p1.ball.y - course.tee.y)).toBeLessThan(10);
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

describe('minigolf bots', () => {
  it('runBotTurn is a no-op (bots act inside the tick)', () => {
    const state = makeState(1);
    expect(runMinigolfBotTurn(state)).toBe(state);
  });

  it('chooses a stroke that moves the ball closer to the cup', () => {
    const course = openCourse();
    const start: MinigolfBall = { x: course.tee.x, y: course.tee.y, vx: 0, vy: 0 };
    const initialDist = Math.hypot(start.x - course.cup.x, start.y - course.cup.y);
    const { angle, power } = chooseBotStroke(start, course, () => 0.5);
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
