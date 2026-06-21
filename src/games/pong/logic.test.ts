import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import {
  BALL_SPEED,
  BOT_ONLY_BALL_SPEED_MULTIPLIER,
  findZoneOwner,
  hitTToZoneOffset,
  hitToPerimeterT,
  paddleArcBounds,
  paddleCenterT,
  paddleCoversHit,
  paddleHalfWidthT,
  preservePaddleOffsets,
  perimeterPoint,
  perimeterTangentAngle,
  EDGE_LEN_H,
  EDGE_LEN_V,
  perimeterLen,
  PLAY_MAX,
  recomputeZones,
  createInitialZones,
  redistributeSurvivorZones,
  reflectVelocity,
  rallySpeedMultiplier,
  simulateBallToZoneIntercept,
  tInZone,
  SERVE_HOLD_TICKS,
  START_COUNTDOWN_TICKS,
  BOUNCE_PLANE,
  TRACK_HALF,
  zoneArcLengthPx,
  zoneLabelT,
  zoneLength,
  normalizeT,
} from './geometry';
import {
  createPongState,
  getPongWinners,
  isPongOver,
  processPongAction,
  assignPongBotColors,
} from './logic';
import type { PongPlayer, PongState } from './types';

function makePlayer(id: string, name: string, isBot = false): Player {
  return {
    id,
    name,
    color: 'red',
    isBot,
    isHost: id === 'p1',
    connected: true,
  };
}

function makePongPlayer(id: string, paddleOffset = 0.5): PongPlayer {
  return {
    id,
    name: id,
    color: 'red',
    isBot: true,
    lives: 2,
    eliminated: false,
    paddleOffset,
  };
}

function createDeterministicPongState(players: Player[], anchorT = 0): PongState {
  const state = createPongState(players) as PongState;
  return {
    ...state,
    zoneAnchorT: anchorT,
    zones: createInitialZones(state.zoneOrder, anchorT),
    startCountdownTicks: 0,
    ball: { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED },
  };
}

function fourPlayerSetup(paddleOffsets?: Record<string, number>) {
  const players = ['p0', 'p1', 'p2', 'p3'].map((id) =>
    makePongPlayer(id, paddleOffsets?.[id] ?? 0.5),
  );
  const zones = recomputeZones(players);
  return { players, zones };
}

describe('pong geometry', () => {
  const aspect = 1;
  const pLen = perimeterLen(aspect);
  const topCenterT = (0.5 * EDGE_LEN_H * aspect) / pLen;
  const bottomCenterT = (EDGE_LEN_H * aspect + EDGE_LEN_V + 0.5 * EDGE_LEN_H * aspect) / pLen;
  const rightEdgeStartT = (EDGE_LEN_H * aspect + 1e-4) / pLen;
  const leftEdgeStartT = (2 * EDGE_LEN_H * aspect + EDGE_LEN_V + 1e-4) / pLen;

  it('maps perimeter parameter around all four edges', () => {
    expect(perimeterPoint(0, aspect)).toMatchObject({ x: 0, y: TRACK_HALF });
    expect(perimeterPoint(topCenterT, aspect).x).toBeCloseTo(0.5);
    expect(perimeterPoint(topCenterT, aspect).y).toBeCloseTo(TRACK_HALF);
    expect(perimeterPoint(rightEdgeStartT, aspect).x).toBeCloseTo(1 - TRACK_HALF);
    expect(perimeterPoint(rightEdgeStartT, aspect).y).toBeCloseTo(TRACK_HALF);
    expect(perimeterPoint(0.5, aspect)).toMatchObject({ x: 1, y: 1 - TRACK_HALF });
    expect(perimeterPoint(bottomCenterT, aspect).x).toBeCloseTo(0.5);
    expect(perimeterPoint(bottomCenterT, aspect).y).toBeCloseTo(1 - TRACK_HALF);
    expect(perimeterPoint(leftEdgeStartT, aspect).x).toBeCloseTo(TRACK_HALF);
    expect(perimeterPoint(leftEdgeStartT, aspect).y).toBeCloseTo(1 - TRACK_HALF);
  });

  it('returns tangent angles for each perimeter edge', () => {
    expect(perimeterTangentAngle(0.125, aspect)).toBeCloseTo(0);
    expect(perimeterTangentAngle(0.375, aspect)).toBeCloseTo(Math.PI / 2);
    expect(perimeterTangentAngle(0.625, aspect)).toBeCloseTo(Math.PI);
    expect(perimeterTangentAngle(0.875, aspect)).toBeCloseTo(-Math.PI / 2);
  });

  it('anchors zone labels inset from the zone start', () => {
    const zone = { playerId: 'a', startT: 0, endT: 0.25 };
    expect(zoneLabelT(zone)).toBeCloseTo(0.0325, 5);
  });

  it('converts top-edge hits to perimeter t', () => {
    expect(hitToPerimeterT(0, BOUNCE_PLANE, aspect)).toBeCloseTo(0, 5);
    expect(hitToPerimeterT(0.5, BOUNCE_PLANE, aspect)).toBeCloseTo(topCenterT, 5);
  });

  it('converts bottom-edge hits to perimeter t', () => {
    expect(hitToPerimeterT(0.5, 1 - BOUNCE_PLANE, aspect)).toBeCloseTo(bottomCenterT, 5);
  });

  it('reflects velocity across a normal', () => {
    const { vx, vy } = reflectVelocity(1, -1, 0, 1);
    expect(vx).toBeCloseTo(1);
    expect(vy).toBeCloseTo(1);
  });

  it('redistributes zones equally when players are eliminated', () => {
    const zoneOrder = ['a', 'b', 'c'];
    const players: PongPlayer[] = [
      { id: 'a', name: 'A', color: 'red', isBot: false, lives: 0, eliminated: true, paddleOffset: 0.5 },
      { id: 'b', name: 'B', color: 'blue', isBot: false, lives: 2, eliminated: false, paddleOffset: 0.5 },
      { id: 'c', name: 'C', color: 'green', isBot: false, lives: 1, eliminated: false, paddleOffset: 0.5 },
    ];
    const redistributed = redistributeSurvivorZones(zoneOrder, 0, players);
    expect(redistributed).toHaveLength(2);
    expect(zoneLength(redistributed[0])).toBeCloseTo(0.5);
    expect(zoneLength(redistributed[1])).toBeCloseTo(0.5);
    expect(redistributed.reduce((sum, z) => sum + zoneLength(z), 0)).toBeCloseTo(1);
    expect(redistributed[0].playerId).toBe('b');
    expect(redistributed[1].playerId).toBe('c');
  });

  it('assigns equal arc-length zones to all players', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) =>
      makePongPlayer(id),
    );
    const zones = recomputeZones(players);
    const arcLengths = zones.map((z) => zoneLength(z) * pLen);
    for (const len of arcLengths) {
      expect(len).toBeCloseTo(pLen / players.length, 10);
    }
  });

  it('assigns equal pixel zone and paddle lengths on a wide rectangle', () => {
    const width = 1600;
    const height = 800;
    const { zones } = fourPlayerSetup();
    const paddleWidthsPx = zones.map((z) => {
      const halfT = paddleHalfWidthT(z);
      return halfT * 2 * zoneArcLengthPx(z, width, height) / zoneLength(z);
    });
    for (const w of paddleWidthsPx) {
      expect(w).toBeCloseTo(paddleWidthsPx[0], 5);
    }
    const zonePx = zones.map((z) => zoneArcLengthPx(z, width, height));
    for (const len of zonePx) {
      expect(len).toBeCloseTo(zonePx[0], 5);
    }
  });

  it('detects paddle coverage within a zone', () => {
    const zone = { playerId: 'p1', startT: 0, endT: 0.25 };
    expect(paddleCoversHit(0.12, zone, 0.5)).toBe(true);
    expect(paddleCoversHit(0.24, zone, 0.05)).toBe(false);
  });

  it('keeps paddle arc inside zone without perimeter wrap', () => {
    const zone = { playerId: 'p1', startT: 0, endT: 0.5 };
    const nearStart = paddleArcBounds(zone, 0.05);
    expect(nearStart.startT).toBeGreaterThanOrEqual(0);
    expect(nearStart.endT).toBeLessThanOrEqual(0.5);
    expect(nearStart.endT - nearStart.startT).toBeLessThan(0.2);
  });

  it('finds zone owner for a perimeter position', () => {
    const zones = recomputeZones([
      { id: 'a', name: 'A', color: 'red', isBot: false, lives: 2, eliminated: false, paddleOffset: 0.5 },
      { id: 'b', name: 'B', color: 'blue', isBot: false, lives: 2, eliminated: false, paddleOffset: 0.5 },
    ]);
    expect(findZoneOwner(0.1, zones)?.playerId).toBe('a');
    expect(findZoneOwner(0.6, zones)?.playerId).toBe('b');
  });

  describe('simulateBallToZoneIntercept', () => {
    it('predicts a direct hit when ball travels straight to the target zone', () => {
      const { players, zones } = fourPlayerSetup();
      const intercept = simulateBallToZoneIntercept(
        { x: 0.5, y: 0.5, vx: 0, vy: -BALL_SPEED },
        zones[0],
        zones,
        players,
      );
      expect(intercept).not.toBeNull();
      expect(intercept!.hitT).toBeCloseTo(topCenterT, 2);
      expect(intercept!.ticksUntilHit).toBeGreaterThan(0);
    });

    it('predicts multi-bounce intercept after the ball reflects off another zone', () => {
      const { players, zones } = fourPlayerSetup();
      const intercept = simulateBallToZoneIntercept(
        { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED },
        zones[0],
        zones,
        players,
      );
      expect(intercept).not.toBeNull();
      expect(intercept!.hitT).toBeCloseTo(topCenterT, 2);
      expect(intercept!.ticksUntilHit).toBeGreaterThan((PLAY_MAX - 0.5) / BALL_SPEED);
    });

    it('follows redirected path when another paddle saves an intermediate hit', () => {
      const { players, zones } = fourPlayerSetup();
      const intercept = simulateBallToZoneIntercept(
        { x: 0.5, y: 0.5, vx: BALL_SPEED, vy: 0 },
        zones[3],
        zones,
        players,
      );
      expect(intercept).not.toBeNull();
      expect(tInZone(intercept!.hitT, zones[3])).toBe(true);
    });

    it('returns null when the rally ends on another player before reaching the target', () => {
      const { players, zones } = fourPlayerSetup({ p2: 0.02 });
      const intercept = simulateBallToZoneIntercept(
        { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED },
        zones[0],
        zones,
        players,
      );
      expect(intercept).toBeNull();
    });

    it('returns null for a stationary ball', () => {
      const { players, zones } = fourPlayerSetup();
      const intercept = simulateBallToZoneIntercept(
        { x: 0.5, y: 0.5, vx: 0, vy: 0 },
        zones[0],
        zones,
        players,
      );
      expect(intercept).toBeNull();
    });
  });
});

describe('pong logic', () => {
  it('creates initial state with two lives per player and equal zones', () => {
    const state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    expect(state.players).toHaveLength(2);
    expect(state.players.every((p) => p.lives === 2)).toBe(true);
    expect(state.zones).toHaveLength(2);
    expect(state.boardAspect).toBe(1);
    expect(state.gameOver).toBe(false);
    expect(state.lifeLossAnnouncement).toBeNull();
    expect(state.ball.x).toBeCloseTo(0.5);
    expect(state.ball.y).toBeCloseTo(0.5);
    expect(state.ball.vx).toBe(0);
    expect(state.ball.vy).toBe(0);
    expect(state.startCountdownTicks).toBe(START_COUNTDOWN_TICKS);
    expect(state.zoneOrder).toEqual(['p1', 'p2']);
    expect(state.zoneAnchorT).toBeGreaterThanOrEqual(0);
    expect(state.zoneAnchorT).toBeLessThan(1);
  });

  it('decrements opening countdown each tick while ball stays centered', () => {
    let state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    const initial = state.startCountdownTicks;
    state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
    expect(state.startCountdownTicks).toBe(initial - 1);
    expect(state.ball.x).toBeCloseTo(0.5);
    expect(state.ball.y).toBeCloseTo(0.5);
    expect(state.ball.vx).toBe(0);
    expect(state.ball.vy).toBe(0);
  });

  it('launches ball when opening countdown finishes', () => {
    let state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    for (let i = 0; i < START_COUNTDOWN_TICKS; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
    }
    expect(state.startCountdownTicks).toBe(0);
    expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeGreaterThan(0);
  });

  it('randomizes zone placement when a new game starts', () => {
    const players = [makePlayer('p1', 'One'), makePlayer('p2', 'Two'), makePlayer('p3', 'Three')];
    const anchors = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const state = createPongState(players) as PongState;
      anchors.add(Math.round(state.zoneAnchorT * 1000));
    }
    expect(anchors.size).toBeGreaterThan(1);
  });

  it('fills the full border with no gaps after eliminations', () => {
    const zoneOrder = ['p1', 'p2', 'p3', 'p4'];
    const anchorT = 0.2;
    const players: PongPlayer[] = zoneOrder.map((id, index) => ({
      id,
      name: id,
      color: 'red',
      isBot: false,
      lives: index === 0 ? 0 : 2,
      eliminated: index === 0,
      paddleOffset: 0.5,
    }));
    const zones = redistributeSurvivorZones(zoneOrder, anchorT, players);
    expect(zones).toHaveLength(3);
    const slice = 1 / 3;
    for (const zone of zones) {
      expect(zoneLength(zone)).toBeCloseTo(slice);
    }
    expect(zones.reduce((sum, z) => sum + zoneLength(z), 0)).toBeCloseTo(1);
    expect(zones[0].startT).toBeCloseTo(normalizeT(anchorT + 1 / 4));
  });

  it('updates board aspect from host action', () => {
    const state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    const next = processPongAction(state, { type: 'set-board-aspect', aspect: 1.6 }, 'p1') as PongState;
    expect(next.boardAspect).toBeCloseTo(1.6);
    const same = processPongAction(next, { type: 'set-board-aspect', aspect: 1.601 }, 'p1') as PongState;
    expect(same).toBe(next);
  });

  it('updates input for alive players', () => {
    const state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    const next = processPongAction(state, { type: 'set-input', direction: 1 }, 'p1') as PongState;
    expect(next.inputs.p1).toBe(1);
  });

  it('ignores input from eliminated players', () => {
    let state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p1' ? { ...p, lives: 0, eliminated: true } : p
      ),
    };
    const next = processPongAction(state, { type: 'set-input', direction: 1 }, 'p1') as PongState;
    expect(next).toBe(state);
  });

  it('advances simulation on host tick', () => {
    const state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    const next = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
    expect(next.startCountdownTicks).toBe(state.startCountdownTicks - 1);
    expect(next.lastTickAt).toBeGreaterThanOrEqual(state.lastTickAt);
  });

  it('rejects tick from non-host player id', () => {
    const state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    const next = processPongAction(state, { type: 'tick', dt: 33 }, 'p1');
    expect(next).toBe(state);
  });

  it('assigns random colors to bots without clashing with human colors', () => {
    const players = [
      makePlayer('p1', 'Human'),
      makePlayer('bot-1', 'Bot 1', true),
      makePlayer('bot-2', 'Bot 2', true),
    ];
    players[0] = { ...players[0], color: 'red' };

    const colored = assignPongBotColors(players);
    expect(colored[0].color).toBe('red');
    expect(colored[1].color).not.toBe('red');
    expect(colored[2].color).not.toBe('red');
    expect(colored[1].color).not.toBe(colored[2].color);
  });

  it('declares a winner when one player remains', () => {
    const state: PongState = {
      players: [
        { id: 'p1', name: 'One', color: 'red', isBot: false, lives: 0, eliminated: true, paddleOffset: 0.5 },
        { id: 'p2', name: 'Two', color: 'blue', isBot: false, lives: 1, eliminated: false, paddleOffset: 0.5 },
      ],
      zones: [{ playerId: 'p2', startT: 0, endT: 1 }],
      zoneOrder: ['p1', 'p2'],
      zoneAnchorT: 0,
      ball: { x: 0.5, y: 0.5, vx: 0.1, vy: 0.2 },
      inputs: {},
      boardAspect: 1,
      startCountdownTicks: 0,
      serveHoldTicks: 0,
      rallyTicks: 0,
      lifeLossAnnouncement: null,
      lastTouchPlayerId: null,
      gameOver: true,
      winners: ['p2'],
      lastTickAt: 0,
    };
    expect(isPongOver(state)).toBe(true);
    expect(getPongWinners(state)).toEqual(['p2']);
  });

  it('moves bot paddle toward multi-bounce intercept before ball arrives', () => {
    const bots = ['p0', 'p1', 'p2', 'p3'].map((id) => makePlayer(id, id, true));
    let state = createDeterministicPongState(bots) as PongState;
    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED },
    };

    const targetZone = state.zones.find((z) => z.playerId === 'p0')!;
    const intercept = simulateBallToZoneIntercept(state.ball, targetZone, state.zones, state.players);
    expect(intercept).not.toBeNull();
    const targetOffset = hitTToZoneOffset(targetZone, intercept!.hitT);

    for (let i = 0; i < 80; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
      if (state.serveHoldTicks > 0 || state.gameOver) break;
    }

    const p0 = state.players.find((p) => p.id === 'p0')!;
    expect(Math.abs(p0.paddleOffset - targetOffset)).toBeLessThan(0.05);
  });

  it('holds bot paddle still when already covering the intercept', () => {
    const bots = ['p0', 'p1', 'p2', 'p3'].map((id) => makePlayer(id, id, true));
    let state = createDeterministicPongState(bots) as PongState;
    const targetZone = state.zones.find((z) => z.playerId === 'p0')!;
    state = {
      ...state,
      ball: { x: 0.5, y: 0.3, vx: 0, vy: -BALL_SPEED },
      players: state.players.map((p) =>
        p.id === 'p0' ? { ...p, paddleOffset: 0.5 } : p,
      ),
    };

    const intercept = simulateBallToZoneIntercept(state.ball, targetZone, state.zones, state.players);
    expect(intercept).not.toBeNull();
    expect(paddleCoversHit(intercept!.hitT, targetZone, 0.5)).toBe(true);

    const offsetBefore = state.players.find((p) => p.id === 'p0')!.paddleOffset;
    for (let i = 0; i < 10; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
    }
    const offsetAfter = state.players.find((p) => p.id === 'p0')!.paddleOffset;
    expect(offsetAfter).toBe(offsetBefore);
  });

  it('uses boosted ball speed when all active players are bots', () => {
    const bots = [makePlayer('bot-1', 'Bot 1', true), makePlayer('bot-2', 'Bot 2', true)];
    let state = createDeterministicPongState(bots) as PongState;
    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED },
    };

    state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;

    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    expect(speed).toBeCloseTo(BALL_SPEED * BOT_ONLY_BALL_SPEED_MULTIPLIER);
  });

  it('keeps normal ball speed when a human is still active', () => {
    const players = [makePlayer('p1', 'Human'), makePlayer('bot-1', 'Bot', true)];
    let state = createPongState(players) as PongState;
    state = {
      ...state,
      startCountdownTicks: 0,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED },
    };

    state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;

    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    expect(speed).toBeCloseTo(BALL_SPEED);
  });

  it('boosts ball speed after the last human is eliminated', () => {
    const players = [
      makePlayer('human', 'Human'),
      makePlayer('bot-1', 'Bot 1', true),
      makePlayer('bot-2', 'Bot 2', true),
    ];
    let state = createPongState(players) as PongState;
    const eliminatedPlayers = state.players.map((p) =>
      p.id === 'human' ? { ...p, lives: 0, eliminated: true } : p,
    );
    state = {
      ...state,
      startCountdownTicks: 0,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED },
      players: eliminatedPlayers,
      zones: redistributeSurvivorZones(state.zoneOrder, state.zoneAnchorT, eliminatedPlayers),
    };

    state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;

    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    expect(speed).toBeCloseTo(BALL_SPEED * BOT_ONLY_BALL_SPEED_MULTIPLIER);
  });

  it('sets lifeLossAnnouncement when a player misses a save', () => {
    const players = [makePlayer('p1', 'One'), makePlayer('p2', 'Two')];
    let state = createDeterministicPongState(players) as PongState;
    const defender = state.players[0];
    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: -BALL_SPEED },
      players: state.players.map((p) =>
        p.id === defender.id ? { ...p, paddleOffset: 0.95 } : p,
      ),
    };

    for (let i = 0; i < 200; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
      if (state.serveHoldTicks > 0) break;
    }

    expect(state.serveHoldTicks).toBe(SERVE_HOLD_TICKS);
    expect(state.lifeLossAnnouncement).toEqual({
      playerId: defender.id,
      eliminated: false,
    });
    expect(state.players.find((p) => p.id === defender.id)?.lives).toBe(1);
    expect(state.startCountdownTicks).toBe(0);
  });

  it('marks eliminated in lifeLossAnnouncement on final life loss', () => {
    const players = [makePlayer('p1', 'One'), makePlayer('p2', 'Two')];
    let state = createDeterministicPongState(players) as PongState;
    const defender = state.players[0];
    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: -BALL_SPEED },
      players: state.players.map((p) =>
        p.id === defender.id ? { ...p, lives: 1, paddleOffset: 0.95 } : p,
      ),
    };

    for (let i = 0; i < 200; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
      if (state.serveHoldTicks > 0) break;
    }

    expect(state.lifeLossAnnouncement).toEqual({
      playerId: defender.id,
      eliminated: true,
    });
    expect(state.players.find((p) => p.id === defender.id)?.eliminated).toBe(true);
  });

  it('clears lifeLossAnnouncement and relaunches the ball when serve hold ends', () => {
    const players = [makePlayer('p1', 'One'), makePlayer('p2', 'Two')];
    let state = createPongState(players) as PongState;
    state = {
      ...state,
      startCountdownTicks: 0,
      serveHoldTicks: 1,
      rallyTicks: 0,
      lifeLossAnnouncement: { playerId: 'p1', eliminated: false },
      ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
    };

    state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;

    expect(state.serveHoldTicks).toBe(0);
    expect(state.lifeLossAnnouncement).toBeNull();
    expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeGreaterThan(0);
    expect(state.gameOver).toBe(false);
  });

  it('defers game over until serve hold ends on final elimination', () => {
    const players = [makePlayer('p1', 'One'), makePlayer('p2', 'Two')];
    let state = createPongState(players) as PongState;
    state = {
      ...state,
      startCountdownTicks: 0,
      players: [
        { ...state.players[0], lives: 0, eliminated: true },
        { ...state.players[1], lives: 1, eliminated: false },
      ],
      zones: [{ playerId: 'p2', startT: 0, endT: 1 }],
      serveHoldTicks: SERVE_HOLD_TICKS,
      rallyTicks: 0,
      lifeLossAnnouncement: { playerId: 'p1', eliminated: true },
      ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
      gameOver: false,
      winners: [],
    };

    expect(state.gameOver).toBe(false);

    for (let i = 0; i < SERVE_HOLD_TICKS; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
    }

    expect(state.gameOver).toBe(true);
    expect(state.winners).toEqual(['p2']);
    expect(state.lifeLossAnnouncement).toBeNull();
    expect(state.ball.vx).toBe(0);
    expect(state.ball.vy).toBe(0);
  });

  it('gradually increases ball speed during a rally', () => {
    const bots = [makePlayer('bot-1', 'Bot 1', true), makePlayer('bot-2', 'Bot 2', true)];
    let state = createDeterministicPongState(bots) as PongState;
    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: BALL_SPEED * BOT_ONLY_BALL_SPEED_MULTIPLIER },
      rallyTicks: 0,
    };

    for (let i = 0; i < 100; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
      if (state.serveHoldTicks > 0 || state.gameOver) break;
    }

    const base = BALL_SPEED * BOT_ONLY_BALL_SPEED_MULTIPLIER;
    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    expect(speed).toBeGreaterThan(base * 1.02);
    expect(state.rallyTicks).toBeGreaterThan(50);
  });

  it('resets ball speed after a point is scored', () => {
    const players = [makePlayer('p1', 'One'), makePlayer('p2', 'Two')];
    let state = createPongState(players) as PongState;
    const defender = state.players[0];

    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: -BALL_SPEED },
      rallyTicks: 500,
      players: state.players.map((p) =>
        p.id === defender.id ? { ...p, paddleOffset: 0.95 } : p,
      ),
    };

    for (let i = 0; i < 200; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
      if (state.serveHoldTicks > 0) break;
    }

    expect(state.rallyTicks).toBe(0);

    for (let i = 0; i < SERVE_HOLD_TICKS; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
    }

    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    expect(speed).toBeCloseTo(BALL_SPEED, 4);
    expect(state.rallyTicks).toBe(0);
  });

  it('initializes rallyTicks at zero', () => {
    const state = createPongState([makePlayer('p1', 'One'), makePlayer('p2', 'Two')]) as PongState;
    expect(state.rallyTicks).toBe(0);
    expect(rallySpeedMultiplier(0)).toBe(1);
    expect(rallySpeedMultiplier(900)).toBeCloseTo(1.25, 2);
    expect(rallySpeedMultiplier(900) * BALL_SPEED).toBeCloseTo(BALL_SPEED * 1.25, 4);
  });

  it('preservePaddleOffsets keeps absolute track position when zone grows', () => {
    const player = makePongPlayer('b', 0.3);
    const oldZones = [
      { playerId: 'a', startT: 0, endT: 0.25 },
      { playerId: 'b', startT: 0.25, endT: 0.5 },
      { playerId: 'c', startT: 0.5, endT: 0.75 },
      { playerId: 'd', startT: 0.75, endT: 1 },
    ];
    const newZones = [
      { playerId: 'b', startT: 0, endT: 1 / 3 },
      { playerId: 'c', startT: 1 / 3, endT: 2 / 3 },
      { playerId: 'd', startT: 2 / 3, endT: 1 },
    ];
    const oldZone = oldZones.find((z) => z.playerId === 'b')!;
    const newZone = newZones.find((z) => z.playerId === 'b')!;
    const centerBefore = paddleCenterT(oldZone, 0.3);

    const [preserved] = preservePaddleOffsets([player], oldZones, newZones);
    const centerAfter = paddleCenterT(newZone, preserved.paddleOffset);

    expect(centerAfter).toBeCloseTo(centerBefore, 5);
    expect(preserved.paddleOffset).not.toBeCloseTo(0.5, 2);
  });

  it('preserves non-defender paddle position on life loss', () => {
    const players = [makePlayer('p1', 'One'), makePlayer('p2', 'Two')];
    let state = createDeterministicPongState(players) as PongState;
    const defender = state.players[0];
    const survivor = state.players[1];
    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: -BALL_SPEED },
      players: state.players.map((p) =>
        p.id === defender.id
          ? { ...p, paddleOffset: 0.95 }
          : { ...p, paddleOffset: 0.2 },
      ),
    };

    for (let i = 0; i < 200; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
      if (state.serveHoldTicks > 0) break;
    }

    expect(state.serveHoldTicks).toBe(SERVE_HOLD_TICKS);
    const survivorAfter = state.players.find((p) => p.id === survivor.id)!;
    expect(survivorAfter.paddleOffset).toBeCloseTo(0.2, 2);
  });

  it('preserves perimeter position when a player is eliminated', () => {
    const players = ['p1', 'p2', 'p3', 'p4'].map((id) => makePlayer(id, id));
    let state = createDeterministicPongState(players) as PongState;
    const targetId = 'p3';
    const targetZoneBefore = state.zones.find((z) => z.playerId === targetId)!;
    const paddleOffset = 0.4;
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === targetId ? { ...p, paddleOffset } : p,
      ),
    };
    const centerBefore = paddleCenterT(targetZoneBefore, paddleOffset);

    state = {
      ...state,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: -BALL_SPEED },
      players: state.players.map((p) =>
        p.id === 'p1' ? { ...p, lives: 1, paddleOffset: 0.95 } : p,
      ),
    };

    for (let i = 0; i < 300; i++) {
      state = processPongAction(state, { type: 'tick', dt: 33 }, '') as PongState;
      if (state.players.find((p) => p.id === 'p1')?.eliminated) break;
    }

    expect(state.players.find((p) => p.id === 'p1')?.eliminated).toBe(true);
    const targetZoneAfter = state.zones.find((z) => z.playerId === targetId)!;
    const targetAfter = state.players.find((p) => p.id === targetId)!;
    const centerAfter = paddleCenterT(targetZoneAfter, targetAfter.paddleOffset);
    expect(centerAfter).toBeCloseTo(centerBefore, 4);
  });
});
