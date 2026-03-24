import type { Player } from '../../networking/types';
import { runSingleBotTurn } from '../gameEngine';
import { DEFAULT_BOARD_GRAPH } from './layout';
import {
  applySettlerIdleTimeout,
  assignSettlerTurnDeadline,
  createSettlerState,
  countPlayerRoads,
  getLegalRoadEdgesForPlayer,
  getLegalSettlementVertices,
  getSettlerIdleActorId,
  legalMaritimeRatiosForGive,
  processSettlerAction,
  removeSettlerPlayer,
  SETTLER_PRE_ROLL_LIMIT_MS,
  SETTLER_TURN_LIMIT_MS,
  victoryPoints,
  visibleVictoryPoints,
  setupCurrentPlayerSlot,
} from './logic';
import { portsFromState } from './ports';
import { VP_TO_WIN, RESOURCE_LIST, withdrawFromBank, emptyHand, emptyDevHand } from './types';
import type { Resource, SettlerState } from './types';

/** Endpoints of a 3:1 port edge for the given game state. */
function genericPortEndpoints(s: SettlerState): { a: number; b: number } {
  const ports = portsFromState(s);
  for (const [eid, k] of Object.entries(ports)) {
    if (k.kind === 'generic-3') {
      const e = DEFAULT_BOARD_GRAPH.edgeById.get(eid)!;
      return { a: e.a, b: e.b };
    }
  }
  throw new Error('no generic port');
}

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    color: (['red', 'blue', 'green', 'orange'] as const)[i % 4]!,
    isBot: false,
    isHost: i === 0,
    connected: true,
  }));
}

/** Consumes `vals` in order as `Math.random` would (each in [0,1)). */
function rngFromSequence(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++] ?? 0.5;
}

/** Resolves `setup-order-roll` with the given RNG (throws if it does not finish). */
function finishSetupOrderRolls(s: SettlerState, rng: () => number): SettlerState {
  let cur = s;
  for (let guard = 0; guard < 200 && cur.phase === 'setup-order-roll'; guard++) {
    const pid = cur.players[cur.currentPlayerIndex]?.id;
    if (!pid) throw new Error('finishSetupOrderRolls: no current player');
    cur = processSettlerAction(cur, { type: 'roll-setup-order' }, pid, rng);
  }
  if (cur.phase === 'setup-order-roll') {
    throw new Error('finishSetupOrderRolls: stuck in setup-order-roll (check RNG / ties)');
  }
  return cur;
}

describe('settler logic', () => {
  it('creates state for 3 players', () => {
    const s = createSettlerState(makePlayers(3), () => 0.5);
    expect(s.players).toHaveLength(3);
    expect(s.hexes).toHaveLength(19);
    expect(s.phase).toBe('setup-order-roll');
    expect(s.setupOrderRoll?.remainingIds).toHaveLength(3);
    expect(s.hexes[s.robberHexIndex]?.terrain).toBe('desert');
    for (const r of RESOURCE_LIST) {
      expect(s.bank[r]).toBe(19);
    }
  });

  it('rejects invalid player count', () => {
    expect(() => createSettlerState(makePlayers(2))).toThrow();
  });

  it('ignores invalid-phase actions without throwing', () => {
    const s = createSettlerState(makePlayers(3));
    const next = processSettlerAction(s, { type: 'end-turn' }, s.players[0]!.id);
    expect(next).toBe(s);
  });

  it('blocks settlements one edge apart in setup', () => {
    const rng = () => 0.99;
    let s = createSettlerState(makePlayers(3), rng);
    s = finishSetupOrderRolls(s, rngFromSequence([0.99, 0.99, 0.65, 0.65, 0.1, 0.1]));
    const p0 = s.players[0]!.id;
    expect(s.currentPlayerIndex).toBe(setupCurrentPlayerSlot(s));

    const verts = getLegalSettlementVertices(s, p0, true);
    expect(verts.length).toBeGreaterThan(0);
    const v0 = verts[0]!;
    s = processSettlerAction(s, { type: 'place-settlement', vertexId: v0 }, p0, rng);
    expect(s.phase).toBe('setup-road');

    const neighbors: number[] = DEFAULT_BOARD_GRAPH.vertexNeighbors.get(v0) ?? [];
    for (const nv of neighbors) {
      expect(getLegalSettlementVertices(s, p0, true).includes(nv)).toBe(false);
    }

    const legalRoad = getLegalRoadEdgesForPlayer(s, p0, true, v0);
    expect(legalRoad.length).toBeGreaterThan(0);
    s = processSettlerAction(s, { type: 'place-road', edgeId: legalRoad[0]! }, p0, rng);
    expect(s.phase).toBe('setup-settlement');
  });

  it('appends action log entries for successful actions', () => {
    const rng = () => 0.99;
    let s = createSettlerState(makePlayers(3), rng);
    s = finishSetupOrderRolls(s, rngFromSequence([0.99, 0.99, 0.65, 0.65, 0.1, 0.1]));
    const p0 = s.players[0]!.id;
    const startCount = s.actionLog.length;
    const verts = getLegalSettlementVertices(s, p0, true);
    const v0 = verts[0]!;
    s = processSettlerAction(s, { type: 'place-settlement', vertexId: v0 }, p0, rng);
    expect(s.actionLog).toHaveLength(startCount + 1);
    expect(s.actionLog.at(-1)).toEqual({
      playerId: p0,
      text: 'placed a settlement',
    });
  });

  it('rolls 7 and requires discard when a player holds more than 7 cards', () => {
    const s0 = createSettlerState(makePlayers(3));
    const pid = s0.players[0]!.id;
    const hand = { ...s0.players[0]!.hand, wood: 8 };
    const players = s0.players.map((p) => (p.id === pid ? { ...p, hand } : p));
    const s = { ...s0, players, phase: 'pre-roll' as const, currentPlayerIndex: 0 };
    let rollCall = 0;
    const rngSeven = () => {
      rollCall++;
      return rollCall === 1 ? 0.92 : 0.05;
    };
    const rolled = processSettlerAction(s, { type: 'roll' }, pid, rngSeven);
    const dice = rolled.dice;
    expect(dice).not.toBeNull();
    expect((dice?.d1 ?? 0) + (dice?.d2 ?? 0)).toBe(7);
    expect(rolled.phase).toBe('discard');
    expect(rolled.discardQueue).toContain(pid);
    expect(rolled.discardRequired[pid]).toBe(4);
  });

  it('logs production collection after a non-7 roll', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0.5);
    const pid = s0.players[0]!.id;
    const hi = s0.hexes.findIndex((h) => h.terrain !== 'desert');
    expect(hi).toBeGreaterThanOrEqual(0);
    const cell = DEFAULT_BOARD_GRAPH.hexes[hi];
    expect(cell).toBeDefined();
    const vid = cell!.cornerVertexIds[0]!;
    const token = 8;
    const hexes = s0.hexes.map((h, i) => (i === hi ? { ...h, numberToken: token } : h));
    const s: SettlerState = {
      ...s0,
      hexes,
      phase: 'pre-roll',
      currentPlayerIndex: 0,
      settlements: { [vid]: { playerId: pid, kind: 'settlement' } },
    };
    let die = 0;
    const rngEight = () => {
      die++;
      return die <= 2 ? 0.55 : 0;
    };
    const rolled = processSettlerAction(s, { type: 'roll' }, pid, rngEight);
    expect(rolled.phase).toBe('main-build');
    expect(rolled.dice).toEqual({ d1: 4, d2: 4 });
    const rollIdx = rolled.actionLog.findIndex((e) => e.playerId === pid && e.text.startsWith('rolled '));
    expect(rollIdx).toBeGreaterThanOrEqual(0);
    const collectIdx = rolled.actionLog.findIndex((e) => e.playerId === pid && e.text.startsWith('got '));
    expect(collectIdx).toBeGreaterThan(rollIdx);
  });

  it('counts victory points from settlements record', () => {
    const s0 = createSettlerState(makePlayers(3));
    const settlements: Record<number, { playerId: string; kind: 'settlement' | 'city' }> = {};
    for (let i = 0; i < 10; i++) {
      settlements[i] = { playerId: s0.players[0]!.id, kind: 'settlement' };
    }
    const s = { ...s0, settlements, phase: 'main-build' as const };
    expect(victoryPoints(s, s0.players[0]!.id)).toBeGreaterThanOrEqual(VP_TO_WIN);
  });

  it('runs a bot turn without throwing', () => {
    const s = createSettlerState(
      makePlayers(3).map((p, i) => ({ ...p, isBot: i === 0 }))
    );
    expect(() => runSingleBotTurn('settler', s)).not.toThrow();
  });

  it('upgrades settlement to city and increases vp', () => {
    const s0 = createSettlerState(makePlayers(3));
    const pid = s0.players[0]!.id;
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      settlements: { 0: { playerId: pid, kind: 'settlement' } },
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, hand: { ...p.hand, ore: 3, wheat: 2 } } : p
      ),
    };
    const next = processSettlerAction(s, { type: 'build-city', vertexId: 0 }, pid);
    expect(next.settlements[0]?.kind).toBe('city');
    expect(victoryPoints(next, pid)).toBe(2);
  });

  it('supports maritime trade and dev card buy', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0);
    const pid = s0.players[0]!.id;
    let bank = s0.bank;
    bank = withdrawFromBank(bank, 'wood', 4).bank;
    bank = withdrawFromBank(bank, 'sheep', 1).bank;
    bank = withdrawFromBank(bank, 'wheat', 1).bank;
    bank = withdrawFromBank(bank, 'ore', 1).bank;
    let s: SettlerState = {
      ...s0,
      bank,
      phase: 'main-build',
      currentPlayerIndex: 0,
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, hand: { ...p.hand, wood: 4, sheep: 1, wheat: 1, ore: 1 } } : p
      ),
    };
    s = processSettlerAction(s, { type: 'maritime-trade', give: 'wood', receive: 'brick', ratio: 4 }, pid);
    expect(s.players[0]!.hand.wood).toBe(0);
    expect(s.players[0]!.hand.brick).toBe(1);
    expect(s.bank.wood).toBe(19);
    expect(s.bank.brick).toBe(18);
    const next = processSettlerAction(s, { type: 'buy-dev-card' }, pid);
    expect(next.devDeck.length).toBe(s.devDeck.length - 1);
    expect(
      next.players[0]!.devCards.knight +
        next.players[0]!.devCards['victory-point'] +
        next.players[0]!.devCards['road-building'] +
        next.players[0]!.devCards['year-of-plenty'] +
        next.players[0]!.devCards.monopoly
    ).toBe(1);
  });

  it('allows 3:1 maritime trade when player has a generic port settlement', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0);
    const pid = s0.players[0]!.id;
    const { a: portVertex } = genericPortEndpoints(s0);
    const s: SettlerState = {
      ...s0,
      settlements: { [portVertex]: { playerId: pid, kind: 'settlement' } },
      phase: 'main-build',
      currentPlayerIndex: 0,
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, hand: { ...emptyHand(), wood: 3 } } : p
      ),
    };
    expect(legalMaritimeRatiosForGive(s, pid, 'wood')).toContain(3);
    const next = processSettlerAction(
      s,
      { type: 'maritime-trade', give: 'wood', receive: 'brick', ratio: 3 },
      pid
    );
    expect(next.players[0]!.hand.wood).toBe(0);
    expect(next.players[0]!.hand.brick).toBe(1);
  });

  it('allows 3:1 maritime trade when settlement is on the port dock partner vertex', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0);
    const pid = s0.players[0]!.id;
    const { a: v0, b: partner } = genericPortEndpoints(s0);
    expect(partner).not.toBe(v0);
    const s: SettlerState = {
      ...s0,
      settlements: { [partner]: { playerId: pid, kind: 'settlement' } },
      phase: 'main-build',
      currentPlayerIndex: 0,
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, hand: { ...emptyHand(), wood: 3 } } : p
      ),
    };
    expect(legalMaritimeRatiosForGive(s, pid, 'wood')).toContain(3);
    const next = processSettlerAction(
      s,
      { type: 'maritime-trade', give: 'wood', receive: 'brick', ratio: 3 },
      pid
    );
    expect(next.players[0]!.hand.wood).toBe(0);
    expect(next.players[0]!.hand.brick).toBe(1);
  });

  it('rejects maritime trade when the bank has none of the requested resource', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0);
    const pid = s0.players[0]!.id;
    let bank = withdrawFromBank(s0.bank, 'brick', 19).bank;
    bank = withdrawFromBank(bank, 'wood', 4).bank;
    const s: SettlerState = {
      ...s0,
      bank,
      phase: 'main-build',
      currentPlayerIndex: 0,
      players: s0.players.map((p, i) => {
        if (i === 0) return { ...p, hand: { ...emptyHand(), wood: 4 } };
        if (i === 1) return { ...p, hand: { ...emptyHand(), brick: 19 } };
        return p;
      }),
    };
    const next = processSettlerAction(s, { type: 'maritime-trade', give: 'wood', receive: 'brick', ratio: 4 }, pid);
    expect(next).toBe(s);
    expect(next.players[0]!.hand.wood).toBe(4);
  });

  it('blocks a resource for all players when total demand exceeds bank (no partial payout)', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0.5);
    const p0 = s0.players[0]!.id;
    const p1 = s0.players[1]!.id;
    const hi = s0.hexes.findIndex((h) => h.terrain === 'wood' && h.numberToken !== null);
    expect(hi).toBeGreaterThanOrEqual(0);
    const cell = DEFAULT_BOARD_GRAPH.hexes[hi];
    expect(cell).toBeDefined();
    const [v0, v1] = cell!.cornerVertexIds;
    expect(v0).toBeDefined();
    expect(v1).toBeDefined();
    const hexes = s0.hexes.map((h, i) => (i === hi ? { ...h, numberToken: 8 } : h));
    const bank = { ...s0.bank, wood: 1 };
    const s: SettlerState = {
      ...s0,
      hexes,
      bank,
      phase: 'pre-roll',
      currentPlayerIndex: 0,
      settlements: {
        [v0!]: { playerId: p0, kind: 'settlement' },
        [v1!]: { playerId: p1, kind: 'settlement' },
      },
    };
    let die = 0;
    const rngEight = () => {
      die++;
      return die <= 2 ? 0.55 : 0;
    };
    const rolled = processSettlerAction(s, { type: 'roll' }, p0, rngEight);
    expect(rolled.players[0]!.hand.wood).toBe(0);
    expect(rolled.players[1]!.hand.wood).toBe(0);
    expect(rolled.bank.wood).toBe(1);
  });

  it('caps production when the bank runs out of a resource', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0.5);
    const pid = s0.players[0]!.id;
    const hi = s0.hexes.findIndex((h) => h.terrain !== 'desert');
    expect(hi).toBeGreaterThanOrEqual(0);
    const cell = DEFAULT_BOARD_GRAPH.hexes[hi];
    expect(cell).toBeDefined();
    const vid = cell!.cornerVertexIds[0]!;
    const token = 8;
    const hexes = s0.hexes.map((h, i) => (i === hi ? { ...h, numberToken: token } : h));
    const terrain = hexes[hi]!.terrain;
    if (terrain === 'desert') throw new Error('expected resource hex');
    let bank = { ...s0.bank, [terrain]: 0 };
    const s: SettlerState = {
      ...s0,
      hexes,
      bank,
      phase: 'pre-roll',
      currentPlayerIndex: 0,
      settlements: { [vid]: { playerId: pid, kind: 'settlement' } },
    };
    let die = 0;
    const rngEight = () => {
      die++;
      return die <= 2 ? 0.55 : 0;
    };
    const rolled = processSettlerAction(s, { type: 'roll' }, pid, rngEight);
    expect(rolled.players[0]!.hand[terrain as Resource]).toBe(0);
    expect(rolled.lastProductionSummary.filter((e) => e.playerId === pid)).toHaveLength(0);
  });

  it('awards longest road and largest army points', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0.5);
    const pid = s0.players[0]!.id;
    const roads = Object.fromEntries(DEFAULT_BOARD_GRAPH.edges.slice(0, 5).map((e) => [e.id, pid]));
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      roads,
      largestArmyHolderId: pid,
      longestRoadHolderId: pid,
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, playedKnights: 3 } : p
      ),
    };
    expect(victoryPoints(s, pid)).toBe(4);
  });

  it('removes a player cleanly from settler state', () => {
    const s0 = createSettlerState(makePlayers(3));
    const removeId = s0.players[1]!.id;
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      settlements: {
        0: { playerId: s0.players[0]!.id, kind: 'settlement' },
        1: { playerId: removeId, kind: 'settlement' },
      },
      roads: { '0-1': removeId, '1-2': s0.players[0]!.id },
      discardQueue: [removeId],
      discardRequired: { [removeId]: 3 },
      robberStealTargets: [removeId],
      currentPlayerIndex: 1,
      pendingDomesticTrade: null,
    };
    const next = removeSettlerPlayer(s, removeId);
    expect(next.players.some((p) => p.id === removeId)).toBe(false);
    expect(Object.values(next.settlements).some((piece) => piece.playerId === removeId)).toBe(false);
    expect(Object.values(next.roads).some((owner) => owner === removeId)).toBe(false);
  });

  it('excludes hidden VP dev cards from visibleVictoryPoints', () => {
    const s0 = createSettlerState(makePlayers(3));
    const pid = s0.players[0]!.id;
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      settlements: { 0: { playerId: pid, kind: 'settlement' } },
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, devCards: { ...emptyDevHand(), 'victory-point': 2 } } : p
      ),
    };
    expect(visibleVictoryPoints(s, pid)).toBe(1);
    expect(victoryPoints(s, pid)).toBe(3);
  });

  it('allows no further road placement at the 15-road supply cap', () => {
    const s0 = createSettlerState(makePlayers(3));
    const pid = s0.players[0]!.id;
    const fifteen = Object.fromEntries(DEFAULT_BOARD_GRAPH.edges.slice(0, 15).map((e) => [e.id, pid]));
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      roads: fifteen,
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, hand: { ...emptyHand(), wood: 4, brick: 4 } } : p
      ),
    };
    expect(countPlayerRoads(s, pid)).toBe(15);
    expect(getLegalRoadEdgesForPlayer(s, pid, false, null)).toEqual([]);
  });

  it('assignSettlerTurnDeadline sets deadline for human idle actor', () => {
    const s0 = createSettlerState(makePlayers(3));
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      dice: { d1: 3, d2: 3 },
    };
    const now = 1_000_000;
    const next = assignSettlerTurnDeadline(s, now);
    expect(next.turnDeadlineAt).toBe(now + SETTLER_TURN_LIMIT_MS);
  });

  it('assignSettlerTurnDeadline uses 10s limit in pre-roll for human roller', () => {
    const s0 = createSettlerState(makePlayers(3));
    const s: SettlerState = {
      ...s0,
      phase: 'pre-roll',
      currentPlayerIndex: 0,
      dice: null,
    };
    const now = 2_000_000;
    const next = assignSettlerTurnDeadline(s, now);
    expect(next.turnDeadlineAt).toBe(now + SETTLER_PRE_ROLL_LIMIT_MS);
  });

  it('assignSettlerTurnDeadline uses 10s limit in setup-order-roll for human roller', () => {
    const s0 = createSettlerState(makePlayers(3));
    const now = 3_000_000;
    const next = assignSettlerTurnDeadline(s0, now);
    expect(next.turnDeadlineAt).toBe(now + SETTLER_PRE_ROLL_LIMIT_MS);
  });

  it('assignSettlerTurnDeadline clears deadline when idle actor is a bot', () => {
    const players = makePlayers(3).map((p, i) => ({ ...p, isBot: i === 0 }));
    const s0 = createSettlerState(players);
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      dice: { d1: 3, d2: 3 },
      turnDeadlineAt: 999,
    };
    const next = assignSettlerTurnDeadline(s, 1_000_000);
    expect(next.turnDeadlineAt).toBeNull();
  });

  it('getSettlerIdleActorId returns trade target when offer is pending', () => {
    const s0 = createSettlerState(makePlayers(3));
    const p0 = s0.players[0]!.id;
    const p1 = s0.players[1]!.id;
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      pendingDomesticTrade: {
        proposerId: p0,
        targetId: p1,
        give: { wood: 1 },
        want: { brick: 1 },
      },
    };
    expect(getSettlerIdleActorId(s)).toBe(p1);
  });

  it('applySettlerIdleTimeout in setup-order-roll auto-rolls without is asleep log', () => {
    const s0 = createSettlerState(makePlayers(3));
    const seq = [0.99, 0.99, 0.65, 0.65, 0.1, 0.1];
    let i = 0;
    const rng = () => seq[i++] ?? 0.5;
    let cur = s0;
    while (cur.phase === 'setup-order-roll') {
      cur = applySettlerIdleTimeout(cur, rng);
    }
    expect(cur.phase).toBe('setup-settlement');
    expect(cur.setupTurnOrder).toEqual([0, 1, 2]);
    expect(cur.actionLog.some((e) => e.text === 'is asleep')).toBe(false);
  });

  it('applySettlerIdleTimeout in pre-roll auto-rolls without is asleep log', () => {
    const s0 = createSettlerState(makePlayers(3));
    const pid = s0.players[0]!.id;
    const s: SettlerState = {
      ...s0,
      phase: 'pre-roll',
      currentPlayerIndex: 0,
      dice: null,
    };
    const rng = () => 0.5;
    const next = applySettlerIdleTimeout(s, rng);
    expect(next.phase).not.toBe('pre-roll');
    expect(next.dice).not.toBeNull();
    expect(next.actionLog.some((e) => e.text === 'is asleep')).toBe(false);
    expect(next.actionLog.some((e) => e.playerId === pid && e.text.startsWith('rolled '))).toBe(true);
  });

  it('applySettlerIdleTimeout logs is asleep and ends turn from main-build', () => {
    const s0 = createSettlerState(makePlayers(3));
    const pid = s0.players[0]!.id;
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      dice: { d1: 3, d2: 3 },
      roadBuildingRemaining: 0,
    };
    const next = applySettlerIdleTimeout(s);
    expect(next.phase).toBe('pre-roll');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.actionLog.some((e) => e.playerId === pid && e.text === 'is asleep')).toBe(true);
    expect(next.actionLog.some((e) => e.playerId === pid && e.text === 'ended their turn')).toBe(true);
  });

  it('applySettlerIdleTimeout clears pending trade with asleep decline message', () => {
    const s0 = createSettlerState(makePlayers(3));
    const p0 = s0.players[0]!.id;
    const p1 = s0.players[1]!.id;
    const s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      pendingDomesticTrade: {
        proposerId: p0,
        targetId: p1,
        give: { wood: 1 },
        want: { brick: 1 },
      },
    };
    const next = applySettlerIdleTimeout(s);
    expect(next.pendingDomesticTrade).toBeNull();
    expect(next.actionLog.at(-1)).toEqual({
      playerId: p1,
      text: 'is asleep (declined the trade)',
    });
  });

  it('tracks setup-order dice display roller while current turn advances', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0.5);
    const p0 = s0.players[0]!.id;
    const p1 = s0.players[1]!.id;
    const p2 = s0.players[2]!.id;
    const rng = rngFromSequence([0.99, 0.99, 0.65, 0.65, 0.1, 0.1]);

    const afterP0 = processSettlerAction(s0, { type: 'roll-setup-order' }, p0, rng);
    expect(afterP0.phase).toBe('setup-order-roll');
    expect(afterP0.currentPlayerIndex).toBe(1);
    expect(afterP0.setupOrderDisplayRollerId).toBe(p0);
    expect(afterP0.dice).toEqual({ d1: 6, d2: 6 });

    const afterP1 = processSettlerAction(afterP0, { type: 'roll-setup-order' }, p1, rng);
    expect(afterP1.phase).toBe('setup-order-roll');
    expect(afterP1.currentPlayerIndex).toBe(2);
    expect(afterP1.setupOrderDisplayRollerId).toBe(p1);
    expect(afterP1.dice).toEqual({ d1: 4, d2: 4 });

    const afterP2 = processSettlerAction(afterP1, { type: 'roll-setup-order' }, p2, rng);
    expect(afterP2.phase).toBe('setup-settlement');
    expect(afterP2.setupOrderDisplayRollerId).toBe(p2);
    expect(afterP2.dice).toEqual({ d1: 1, d2: 1 });
  });

  it('setup-order-roll yields descending setupTurnOrder without ties', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0.99);
    const s = finishSetupOrderRolls(s0, rngFromSequence([0.99, 0.99, 0.65, 0.65, 0.1, 0.1]));
    expect(s.phase).toBe('setup-settlement');
    expect(s.setupTurnOrder).toEqual([0, 1, 2]);
    expect(setupCurrentPlayerSlot(s)).toBe(0);
  });

  it('setup-order-roll breaks a two-player tie with a second wave', () => {
    const s0 = createSettlerState(makePlayers(3), () => 0.99);
    const seq = [
      0.5, 0.5, 0.5, 0.5, 0.1, 0.1, 0.99, 0.99, 0.1, 0.1,
    ];
    const s = finishSetupOrderRolls(s0, rngFromSequence(seq));
    expect(s.phase).toBe('setup-settlement');
    expect(s.setupTurnOrder).toEqual([0, 1, 2]);
  });

  it('setup-order-roll resolves two separate tie groups for four players', () => {
    const s0 = createSettlerState(makePlayers(4), () => 0.99);
    const seq = [
      0.55, 0.95, 0.55, 0.95, 0.1, 0.45, 0.1, 0.45,
      0.99, 0.99, 0.1, 0.1,
      0.99, 0.99, 0.1, 0.1,
    ];
    const s = finishSetupOrderRolls(s0, rngFromSequence(seq));
    expect(s.phase).toBe('setup-settlement');
    expect(s.setupTurnOrder).toEqual([0, 1, 2, 3]);
  });
});
