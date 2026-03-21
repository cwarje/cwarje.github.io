import type { Player } from '../../networking/types';
import { runSingleBotTurn } from '../gameEngine';
import { DEFAULT_BOARD_GRAPH } from './layout';
import {
  createSettlerState,
  getLegalRoadEdgesForPlayer,
  getLegalSettlementVertices,
  processSettlerAction,
  removeSettlerPlayer,
  victoryPoints,
  setupCurrentPlayerSlot,
} from './logic';
import { VP_TO_WIN } from './types';
import type { SettlerState } from './types';

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

describe('settler logic', () => {
  it('creates state for 3 players', () => {
    const s = createSettlerState(makePlayers(3), () => 0.5);
    expect(s.players).toHaveLength(3);
    expect(s.hexes).toHaveLength(19);
    expect(s.phase).toBe('setup-settlement');
    expect(s.hexes[s.robberHexIndex]?.terrain).toBe('desert');
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
    const p0 = s.players[0]!.id;
    expect(s.actionLog).toEqual([]);

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
    let s: SettlerState = {
      ...s0,
      phase: 'main-build',
      currentPlayerIndex: 0,
      players: s0.players.map((p, i) =>
        i === 0 ? { ...p, hand: { ...p.hand, wood: 4, sheep: 1, wheat: 1, ore: 1 } } : p
      ),
    };
    s = processSettlerAction(s, { type: 'maritime-trade', give: 'wood', receive: 'brick' }, pid);
    expect(s.players[0]!.hand.wood).toBe(0);
    expect(s.players[0]!.hand.brick).toBe(1);
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
    };
    const next = removeSettlerPlayer(s, removeId);
    expect(next.players.some((p) => p.id === removeId)).toBe(false);
    expect(Object.values(next.settlements).some((piece) => piece.playerId === removeId)).toBe(false);
    expect(Object.values(next.roads).some((owner) => owner === removeId)).toBe(false);
  });
});
