import type { Player } from '../../networking/types';
import { DEFAULT_BOARD_GRAPH, type BoardGraph } from './layout';
import type {
  SettlerAction,
  SettlerPlayer,
  SettlerState,
  DevCard,
  DevCardHand,
  HexTile,
  Resource,
  ResourceHand,
} from './types';
import {
  COSTS,
  DEV_DECK,
  emptyHand,
  emptyDevHand,
  handTotal,
  NUMBER_DECK,
  RESOURCE_LIST,
  RESOURCE_EMOJI,
  TERRAIN_DECK,
  VP_TO_WIN,
  addResource,
  removeResource,
} from './types';

const graph: BoardGraph = DEFAULT_BOARD_GRAPH;
const MAX_ACTION_LOG_ENTRIES = 100;

/** Unicode die faces U+2680–U+2685 for compact 2d6 in the action log. */
const DIE_FACE_UNICODE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

function diceRollActionLogText(d1: number, d2: number, suffix = ''): string {
  const a = DIE_FACE_UNICODE[d1 - 1];
  const b = DIE_FACE_UNICODE[d2 - 1];
  if (a === undefined || b === undefined) return `rolled ${d1} ${d2}${suffix}`;
  return `rolled ${a} ${b}${suffix}`;
}

function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function terrainToResource(t: HexTile['terrain']): Resource | null {
  if (t === 'desert') return null;
  return t;
}

function playerNameById(s: SettlerState, playerId: string): string {
  return s.players.find((p) => p.id === playerId)?.name ?? playerId;
}

function appendActionLog(
  s: SettlerState,
  playerId: string,
  text: string
): Pick<SettlerState, 'actionLog' | 'lastEvent'> {
  return {
    actionLog: [...(s.actionLog ?? []), { playerId, text }].slice(-MAX_ACTION_LOG_ENTRIES),
    lastEvent: `${playerNameById(s, playerId)} ${text}`,
  };
}

function appendActionLogChain(
  s: SettlerState,
  entries: { playerId: string; text: string }[],
  lastEvent: string | null
): Pick<SettlerState, 'actionLog' | 'lastEvent'> {
  return {
    actionLog: [...(s.actionLog ?? []), ...entries].slice(-MAX_ACTION_LOG_ENTRIES),
    lastEvent,
  };
}

/** One log row per player who received production this roll (text after "Name: "). */
function productionActionLogEntries(
  s: SettlerState,
  summary: SettlerState['lastProductionSummary']
): { playerId: string; text: string }[] {
  if (summary.length === 0) return [];
  const grouped = new Map<string, string[]>();
  for (const entry of summary) {
    const emoji = RESOURCE_EMOJI[entry.resource];
    const resourceText = Array.from({ length: entry.amount }, () => emoji).join(' ');
    grouped.set(entry.playerId, [...(grouped.get(entry.playerId) ?? []), resourceText]);
  }
  const out: { playerId: string; text: string }[] = [];
  for (const p of s.players) {
    const items = grouped.get(p.id);
    if (!items || items.length === 0) continue;
    out.push({ playerId: p.id, text: `got ${items.join(', ')}` });
  }
  return out;
}

export function setupCurrentPlayerSlot(s: SettlerState): number {
  const n = s.players.length;
  if (s.setupRound === 1) return s.setupOrderIndex;
  return n - 1 - s.setupOrderIndex;
}

function syncCurrentPlayerForSetup(s: SettlerState): SettlerState {
  return { ...s, currentPlayerIndex: setupCurrentPlayerSlot(s) };
}

function neighborSettlementsExist(s: SettlerState, vertexId: number): boolean {
  const neigh = graph.vertexNeighbors.get(vertexId) ?? [];
  for (const nv of neigh) {
    if (s.settlements[nv] !== undefined) return true;
  }
  return false;
}

function vertexTouchesPlayerRoad(s: SettlerState, playerId: string, vertexId: number): boolean {
  for (const e of graph.edges) {
    if (s.roads[e.id] !== playerId) continue;
    if (e.a === vertexId || e.b === vertexId) return true;
  }
  return false;
}

/** Road network: building or own road on this vertex. */
function connectedToNetwork(s: SettlerState, playerId: string, vertexId: number): boolean {
  if (vertexHasPlayerBuilding(s, playerId, vertexId)) return true;
  return vertexTouchesPlayerRoad(s, playerId, vertexId);
}

function vertexHasPlayerBuilding(s: SettlerState, playerId: string, vertexId: number): boolean {
  const p = s.settlements[vertexId];
  return p !== undefined && p.playerId === playerId;
}

function canAfford(h: ResourceHand, cost: Partial<Record<Resource, number>>): boolean {
  for (const r of RESOURCE_LIST) {
    const c = cost[r] ?? 0;
    if (h[r] < c) return false;
  }
  return true;
}

function pay(h: ResourceHand, cost: Partial<Record<Resource, number>>): ResourceHand {
  let next = { ...h };
  for (const r of RESOURCE_LIST) {
    const c = cost[r] ?? 0;
    next = { ...next, [r]: next[r] - c };
  }
  return next;
}

function addDevCard(h: DevCardHand, card: DevCard, n: number): DevCardHand {
  return { ...h, [card]: h[card] + n };
}

function removeDevCard(h: DevCardHand, card: DevCard, n: number): DevCardHand {
  return { ...h, [card]: Math.max(0, h[card] - n) };
}

function canPlayDevCard(pl: SettlerPlayer, card: Exclude<DevCard, 'victory-point'>): boolean {
  return pl.devCards[card] - pl.newDevCards[card] > 0;
}

function edgeBlockedByEnemyBuilding(s: SettlerState, playerId: string, edgeId: string): boolean {
  const edge = graph.edgeById.get(edgeId);
  if (!edge) return true;
  const aPiece = s.settlements[edge.a];
  const bPiece = s.settlements[edge.b];
  const aBlocked = aPiece && aPiece.playerId !== playerId;
  const bBlocked = bPiece && bPiece.playerId !== playerId;
  return Boolean(aBlocked && bBlocked);
}

function longestRoadForPlayer(s: SettlerState, playerId: string): number {
  const playerEdges = graph.edges.filter((e) => s.roads[e.id] === playerId).map((e) => e.id);
  if (playerEdges.length === 0) return 0;

  const edgesByVertex = new Map<number, string[]>();
  for (const eid of playerEdges) {
    const e = graph.edgeById.get(eid);
    if (!e) continue;
    const a = edgesByVertex.get(e.a) ?? [];
    const b = edgesByVertex.get(e.b) ?? [];
    a.push(eid);
    b.push(eid);
    edgesByVertex.set(e.a, a);
    edgesByVertex.set(e.b, b);
  }

  const blockedVertex = (vId: number): boolean => {
    const piece = s.settlements[vId];
    return Boolean(piece && piece.playerId !== playerId);
  };

  const dfs = (edgeId: string, fromVertex: number, visited: Set<string>): number => {
    const edge = graph.edgeById.get(edgeId);
    if (!edge) return 0;
    const nextVertex = edge.a === fromVertex ? edge.b : edge.a;
    let best = 1;
    if (blockedVertex(nextVertex)) return best;
    const nextEdges = edgesByVertex.get(nextVertex) ?? [];
    for (const next of nextEdges) {
      if (visited.has(next)) continue;
      visited.add(next);
      best = Math.max(best, 1 + dfs(next, nextVertex, visited));
      visited.delete(next);
    }
    return best;
  };

  let best = 0;
  for (const eid of playerEdges) {
    const e = graph.edgeById.get(eid);
    if (!e) continue;
    const seenA = new Set<string>([eid]);
    best = Math.max(best, dfs(eid, e.a, seenA));
    const seenB = new Set<string>([eid]);
    best = Math.max(best, dfs(eid, e.b, seenB));
  }
  return best;
}

function recomputeAwards(s: SettlerState): SettlerState {
  const roadLengths = new Map<string, number>();
  for (const p of s.players) {
    roadLengths.set(p.id, longestRoadForPlayer(s, p.id));
  }
  const longest = Math.max(0, ...[...roadLengths.values()]);
  let longestRoadHolderId: string | null = null;
  if (longest >= 5) {
    const leaders = s.players.filter((p) => roadLengths.get(p.id) === longest).map((p) => p.id);
    if (leaders.length === 1) {
      longestRoadHolderId = leaders[0]!;
    } else if (s.longestRoadHolderId && leaders.includes(s.longestRoadHolderId)) {
      longestRoadHolderId = s.longestRoadHolderId;
    }
  }

  const knightCounts = s.players.map((p) => p.playedKnights);
  const topKnights = Math.max(0, ...knightCounts);
  let largestArmyHolderId: string | null = null;
  if (topKnights >= 3) {
    const leaders = s.players.filter((p) => p.playedKnights === topKnights).map((p) => p.id);
    if (leaders.length === 1) {
      largestArmyHolderId = leaders[0]!;
    } else if (s.largestArmyHolderId && leaders.includes(s.largestArmyHolderId)) {
      largestArmyHolderId = s.largestArmyHolderId;
    }
  }

  return { ...s, longestRoadHolderId, largestArmyHolderId };
}

export function victoryPoints(s: SettlerState, playerId: string): number {
  let vp = 0;
  for (const piece of Object.values(s.settlements)) {
    if (piece.playerId !== playerId) continue;
    vp += piece.kind === 'city' ? 2 : 1;
  }
  const player = s.players.find((p) => p.id === playerId);
  if (player) {
    vp += player.devCards['victory-point'];
  }
  if (s.longestRoadHolderId === playerId) vp += 2;
  if (s.largestArmyHolderId === playerId) vp += 2;
  return vp;
}

function checkWin(s: SettlerState): SettlerState {
  const withVp = s.players.map((p) => ({ id: p.id, vp: victoryPoints(s, p.id) }));
  const maxVp = Math.max(0, ...withVp.map((x) => x.vp));
  if (maxVp >= VP_TO_WIN) {
    const winnerIds = withVp.filter((x) => x.vp === maxVp).map((x) => x.id);
    return { ...s, phase: 'finished', winnerIds };
  }
  return s;
}

function grantSecondSettlementResources(s: SettlerState, vertexId: number): SettlerState {
  const vid = vertexId;
  const v = graph.vertices[vid];
  if (!v) return s;
  const pid = s.settlements[vid]?.playerId;
  if (!pid) return s;

  let players = s.players.map((pl) => {
    if (pl.id !== pid) return pl;
    let hand = { ...pl.hand };
    for (const hi of v.hexIndices) {
      const hex = s.hexes[hi];
      if (!hex) continue;
      const res = terrainToResource(hex.terrain);
      if (res) hand = addResource(hand, res, 1);
    }
    return { ...pl, hand };
  });
  return { ...s, players };
}

function applyProduction(s: SettlerState, sum: number): SettlerState {
  if (sum === 7) return { ...s, lastProductionHexIndices: [], lastProductionSummary: [] };

  const produced: number[] = [];
  const producedByPlayer = new Map<string, Partial<Record<Resource, number>>>();
  let players = s.players.map((p) => ({ ...p, hand: { ...p.hand } }));

  for (let hi = 0; hi < s.hexes.length; hi++) {
    const hex = s.hexes[hi];
    if (!hex || hex.terrain === 'desert') continue;
    if (hi === s.robberHexIndex) continue;
    if (hex.numberToken !== sum) continue;

    produced.push(hi);
    const res = terrainToResource(hex.terrain);
    if (!res) continue;

    const cell = graph.hexes[hi];
    if (!cell) continue;
    for (const vid of cell.cornerVertexIds) {
      const piece = s.settlements[vid];
      if (!piece) continue;
      const amt = piece.kind === 'city' ? 2 : 1;
      const pi = players.findIndex((x) => x.id === piece.playerId);
      if (pi >= 0) {
        const pl = players[pi]!;
        players[pi] = { ...pl, hand: addResource(pl.hand, res, amt) };
        const prev = producedByPlayer.get(piece.playerId) ?? {};
        producedByPlayer.set(piece.playerId, { ...prev, [res]: (prev[res] ?? 0) + amt });
      }
    }
  }
  const lastProductionSummary: SettlerState['lastProductionSummary'] = [];
  for (const p of s.players) {
    const bag = producedByPlayer.get(p.id);
    if (!bag) continue;
    for (const r of RESOURCE_LIST) {
      const amount = bag[r] ?? 0;
      if (amount > 0) {
        lastProductionSummary.push({ playerId: p.id, resource: r, amount });
      }
    }
  }

  return { ...s, players, lastProductionHexIndices: produced, lastProductionSummary };
}

function buildDiscardState(s: SettlerState): SettlerState {
  const queue: string[] = [];
  const required: Record<string, number> = {};
  for (const p of s.players) {
    const t = handTotal(p.hand);
    if (t > 7) {
      queue.push(p.id);
      required[p.id] = Math.floor(t / 2);
    }
  }
  if (queue.length === 0) {
    return { ...s, phase: 'robber-move' };
  }
  // Stable order by player order
  queue.sort((a, b) => s.players.findIndex((x) => x.id === a) - s.players.findIndex((x) => x.id === b));
  return { ...s, phase: 'discard', discardQueue: queue, discardRequired: required };
}

function stealRandomResource(
  players: SettlerPlayer[],
  fromId: string,
  toId: string,
  random: () => number
): SettlerPlayer[] {
  const fromI = players.findIndex((p) => p.id === fromId);
  const toI = players.findIndex((p) => p.id === toId);
  if (fromI < 0 || toI < 0) return players;

  const from = players[fromI]!;
  const cards: Resource[] = [];
  for (const r of RESOURCE_LIST) {
    for (let k = 0; k < from.hand[r]; k++) cards.push(r);
  }
  if (cards.length === 0) return players;

  const pick = cards[Math.floor(random() * cards.length)]!;
  const next = players.map((p) => ({ ...p, hand: { ...p.hand } }));
  next[fromI] = { ...next[fromI]!, hand: removeResource(next[fromI]!.hand, pick, 1) };
  next[toI] = { ...next[toI]!, hand: addResource(next[toI]!.hand, pick, 1) };
  return next;
}

function robberVictims(s: SettlerState, hexIndex: number, rollerId: string): string[] {
  const cell = graph.hexes[hexIndex];
  if (!cell) return [];
  const victims = new Set<string>();
  for (const vid of cell.cornerVertexIds) {
    const piece = s.settlements[vid];
    if (!piece || piece.playerId === rollerId) continue;
    const pl = s.players.find((p) => p.id === piece.playerId);
    if (pl && handTotal(pl.hand) > 0) victims.add(piece.playerId);
  }
  return [...victims];
}

export function createSettlerState(playersIn: Player[], random: () => number = Math.random): SettlerState {
  const n = playersIn.length;
  if (n < 3 || n > 4) {
    throw new Error('Settler requires 3–4 players');
  }

  const terrains = shuffle([...TERRAIN_DECK], random);
  const numbers = shuffle([...NUMBER_DECK], random);

  const hexes: HexTile[] = terrains.map((terrain) => {
    if (terrain === 'desert') return { terrain, numberToken: null };
    const numberToken = numbers.shift() ?? 2;
    return { terrain, numberToken };
  });

  const robberHexIndex = hexes.findIndex((h) => h.terrain === 'desert');
  const players: SettlerPlayer[] = playersIn.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: p.isBot,
    hand: emptyHand(),
    devCards: emptyDevHand(),
    newDevCards: emptyDevHand(),
    playedKnights: 0,
  }));

  const s: SettlerState = {
    players,
    hexes,
    robberHexIndex: robberHexIndex >= 0 ? robberHexIndex : 0,
    settlements: {},
    roads: {},
    currentPlayerIndex: 0,
    phase: 'setup-settlement',
    setupRound: 1,
    setupOrderIndex: 0,
    pendingRoadFromVertex: null,
    dice: null,
    lastProductionHexIndices: [],
    lastProductionSummary: [],
    discardQueue: [],
    discardRequired: {},
    robberStealTargets: [],
    devDeck: shuffle([...DEV_DECK], random),
    largestArmyHolderId: null,
    longestRoadHolderId: null,
    playedDevCardThisTurn: false,
    roadBuildingRemaining: 0,
    actionLog: [],
    lastEvent: null,
    winnerIds: null,
  };
  return syncCurrentPlayerForSetup(s);
}

export function getLegalSettlementVertices(
  s: SettlerState,
  playerId: string,
  setup: boolean
): number[] {
  return legalSettlementVertices(s, playerId, setup);
}

export function getLegalRoadEdgesForPlayer(
  s: SettlerState,
  playerId: string,
  setup: boolean,
  fromVertex: number | null
): string[] {
  return legalRoadEdges(s, playerId, setup, fromVertex);
}

function legalSettlementVertices(s: SettlerState, playerId: string, setup: boolean): number[] {
  const out: number[] = [];
  for (const v of graph.vertices) {
    if (s.settlements[v.id] !== undefined) continue;
    if (neighborSettlementsExist(s, v.id)) continue;
    if (setup) {
      out.push(v.id);
      continue;
    }
    if (!vertexTouchesPlayerRoad(s, playerId, v.id)) continue;
    out.push(v.id);
  }
  return out.sort((a, b) => a - b);
}

function legalRoadEdges(
  s: SettlerState,
  playerId: string,
  setup: boolean,
  fromVertex: number | null
): string[] {
  const out: string[] = [];
  for (const e of graph.edges) {
    if (s.roads[e.id] !== undefined) continue;
    if (!setup && edgeBlockedByEnemyBuilding(s, playerId, e.id)) continue;
    if (setup && fromVertex !== null) {
      if (e.a !== fromVertex && e.b !== fromVertex) continue;
      out.push(e.id);
      continue;
    }
    if (setup) continue;

    if (connectedToNetwork(s, playerId, e.a) || connectedToNetwork(s, playerId, e.b)) {
      out.push(e.id);
    }
  }
  return [...new Set(out)].sort();
}

export function processSettlerAction(
  state: SettlerState,
  action: SettlerAction,
  playerId: string,
  random: () => number = Math.random
): SettlerState {
  if (state.phase === 'finished') return state;

  if (state.phase === 'discard') {
    if (action.type !== 'discard') return state;
    const first = state.discardQueue[0];
    if (first !== playerId) return state;
    const need = state.discardRequired[playerId] ?? 0;
    let drop = 0;
    const cards = action.cards;
    for (const r of RESOURCE_LIST) {
      drop += cards[r] ?? 0;
    }
    if (drop !== need) return state;

    const pl = state.players.find((p) => p.id === playerId);
    if (!pl) return state;
    let hand = { ...pl.hand };
    for (const r of RESOURCE_LIST) {
      const d = cards[r] ?? 0;
      if (hand[r] < d) return state;
      hand = removeResource(hand, r, d);
    }

    let players = state.players.map((p) => (p.id === playerId ? { ...p, hand } : p));
    let discardQueue = state.discardQueue.slice(1);
    let discardRequired = { ...state.discardRequired };
    delete discardRequired[playerId];

    let next: SettlerState = {
      ...state,
      players,
      discardQueue,
      discardRequired,
      ...appendActionLog(state, playerId, `discarded ${need} cards`),
    };
    if (discardQueue.length === 0) {
      next = { ...next, phase: 'robber-move' };
    }
    return next;
  }

  const currentId = state.players[state.currentPlayerIndex]?.id;
  if (currentId !== playerId) return state;
  const actor = state.players.find((p) => p.id === playerId);
  if (!actor) return state;

  switch (action.type) {
    case 'place-settlement': {
      if (state.phase !== 'setup-settlement') return state;
      const vid = action.vertexId;
      if (!graph.vertices[vid]) return state;
      if (state.settlements[vid] !== undefined) return state;
      if (neighborSettlementsExist(state, vid)) return state;

      let next: SettlerState = {
        ...state,
        settlements: { ...state.settlements, [vid]: { playerId, kind: 'settlement' } },
        phase: 'setup-road',
        pendingRoadFromVertex: vid,
        ...appendActionLog(state, playerId, 'placed a settlement'),
      };
      next = syncCurrentPlayerForSetup(next);
      if (state.setupRound === 2) {
        next = grantSecondSettlementResources(next, vid);
      }
      return checkWin(next);
    }
    case 'place-road': {
      if (state.phase !== 'setup-road') return state;
      const fv = state.pendingRoadFromVertex;
      if (fv === null) return state;
      const eid = action.edgeId;
      const e = graph.edgeById.get(eid);
      if (!e) return state;
      if (state.roads[eid] !== undefined) return state;
      if (e.a !== fv && e.b !== fv) return state;

      let next: SettlerState = {
        ...state,
        roads: { ...state.roads, [eid]: playerId },
        phase: 'setup-settlement',
        pendingRoadFromVertex: null,
        ...appendActionLog(state, playerId, 'placed a road'),
      };

      const n = state.players.length;
      if (state.setupRound === 1 && state.setupOrderIndex === n - 1) {
        next = { ...next, setupRound: 2, setupOrderIndex: 0 };
        next = syncCurrentPlayerForSetup(next);
        return checkWin(next);
      } else if (state.setupRound === 2 && state.setupOrderIndex === n - 1) {
        next = {
          ...next,
          phase: 'pre-roll',
          setupRound: 1,
          setupOrderIndex: 0,
          currentPlayerIndex: 0,
          pendingRoadFromVertex: null,
        };
        return checkWin(next);
      }
      next = { ...next, setupOrderIndex: state.setupOrderIndex + 1 };
      next = syncCurrentPlayerForSetup(next);
      return checkWin(next);
    }
    case 'roll': {
      if (state.phase !== 'pre-roll') return state;
      const d1 = 1 + Math.floor(random() * 6);
      const d2 = 1 + Math.floor(random() * 6);
      const sum = d1 + d2;
      let next: SettlerState = {
        ...state,
        dice: { d1, d2 },
      };
      if (sum === 7) {
        next = buildDiscardState(next);
        const discarders = next.discardQueue.length;
        const discardText =
          discarders > 0
            ? ` ${discarders} player${discarders === 1 ? '' : 's'} must discard.`
            : '';
        next = {
          ...next,
          lastProductionSummary: [],
          ...appendActionLog(state, playerId, diceRollActionLogText(d1, d2, `.${discardText}`)),
        };
      } else {
        next = applyProduction(next, sum);
        const rollText = diceRollActionLogText(d1, d2);
        const prodEntries = productionActionLogEntries(next, next.lastProductionSummary);
        const logEntries = [{ playerId, text: rollText }, ...prodEntries];
        next = {
          ...next,
          phase: 'main-build',
          playedDevCardThisTurn: false,
          roadBuildingRemaining: 0,
          ...appendActionLogChain(next, logEntries, `${playerNameById(next, playerId)} ${rollText}`),
        };
        next = checkWin(next);
      }
      return next;
    }
    case 'move-robber': {
      if (state.phase !== 'robber-move') return state;
      const hi = action.hexIndex;
      if (hi < 0 || hi >= state.hexes.length) return state;
      if (hi === state.robberHexIndex) return state;

      const rollerId = state.players[state.currentPlayerIndex]!.id;
      const victims = robberVictims({ ...state, robberHexIndex: hi }, hi, rollerId);

      let next: SettlerState = {
        ...state,
        robberHexIndex: hi,
        robberStealTargets: victims,
        ...appendActionLog(state, playerId, 'moved the robber'),
      };

      if (victims.length === 0) {
        next = { ...next, phase: 'main-build', robberStealTargets: [] };
      } else if (victims.length === 1) {
        const vId = victims[0]!;
        next = {
          ...next,
          phase: 'main-build',
          robberStealTargets: [],
          players: stealRandomResource(next.players, vId, rollerId, random),
          ...appendActionLog(next, rollerId, `stole from ${playerNameById(next, vId)}`),
        };
      } else {
        next = { ...next, phase: 'robber-steal' };
      }
      return checkWin(next);
    }
    case 'steal-from': {
      if (state.phase !== 'robber-steal') return state;
      const victim = action.victimId;
      if (!state.robberStealTargets.includes(victim)) return state;
      const rollerId = state.players[state.currentPlayerIndex]!.id;
      const next: SettlerState = {
        ...state,
        phase: 'main-build',
        robberStealTargets: [],
        players: stealRandomResource(state.players, victim, rollerId, random),
        ...appendActionLog(state, playerId, `stole from ${playerNameById(state, victim)}`),
      };
      return checkWin(next);
    }
    case 'build-road': {
      if (state.phase !== 'main-build') return state;
      if (state.roadBuildingRemaining > 0) return state;
      const eid = action.edgeId;
      const legal = legalRoadEdges(state, playerId, false, null);
      if (!legal.includes(eid)) return state;
      if (!canAfford(actor.hand, COSTS.road)) return state;

      const next: SettlerState = recomputeAwards({
        ...state,
        roads: { ...state.roads, [eid]: playerId },
        players: state.players.map((p) =>
          p.id === playerId ? { ...p, hand: pay(p.hand, COSTS.road) } : p
        ),
        ...appendActionLog(state, playerId, 'built a road'),
      });
      return checkWin(next);
    }
    case 'place-free-road': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining <= 0) return state;
      const eid = action.edgeId;
      const legal = legalRoadEdges(state, playerId, false, null);
      if (!legal.includes(eid)) return state;
      const next: SettlerState = recomputeAwards({
        ...state,
        roads: { ...state.roads, [eid]: playerId },
        roadBuildingRemaining: state.roadBuildingRemaining - 1,
        ...appendActionLog(state, playerId, 'placed a free road'),
      });
      return checkWin(next);
    }
    case 'skip-free-road': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining <= 0) return state;
      return {
        ...state,
        roadBuildingRemaining: 0,
        ...appendActionLog(state, playerId, 'skipped free road placement'),
      };
    }
    case 'build-settlement': {
      if (state.phase !== 'main-build') return state;
      if (state.roadBuildingRemaining > 0) return state;
      const vid = action.vertexId;
      const legal = legalSettlementVertices(state, playerId, false);
      if (!legal.includes(vid)) return state;
      if (!canAfford(actor.hand, COSTS.settlement)) return state;

      const next: SettlerState = {
        ...state,
        settlements: { ...state.settlements, [vid]: { playerId, kind: 'settlement' } },
        players: state.players.map((p) =>
          p.id === playerId ? { ...p, hand: pay(p.hand, COSTS.settlement) } : p
        ),
        ...appendActionLog(state, playerId, 'built a settlement'),
      };
      return checkWin(next);
    }
    case 'build-city': {
      if (state.phase !== 'main-build') return state;
      if (state.roadBuildingRemaining > 0) return state;
      const vid = action.vertexId;
      const piece = state.settlements[vid];
      if (!piece || piece.playerId !== playerId || piece.kind !== 'settlement') return state;
      if (!canAfford(actor.hand, COSTS.city)) return state;

      const next: SettlerState = {
        ...state,
        settlements: {
          ...state.settlements,
          [vid]: { playerId, kind: 'city' },
        },
        players: state.players.map((p) =>
          p.id === playerId ? { ...p, hand: pay(p.hand, COSTS.city) } : p
        ),
        ...appendActionLog(state, playerId, 'built a city'),
      };
      return checkWin(next);
    }
    case 'maritime-trade': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      if (action.give === action.receive) return state;
      if (actor.hand[action.give] < 4) return state;
      const players = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const hand = addResource(removeResource(p.hand, action.give, 4), action.receive, 1);
        return { ...p, hand };
      });
      return {
        ...state,
        players,
        ...appendActionLog(
          state,
          playerId,
          `traded 4 ${RESOURCE_EMOJI[action.give]} for 1 ${RESOURCE_EMOJI[action.receive]}`
        ),
      };
    }
    case 'buy-dev-card': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      if (state.devDeck.length === 0) return state;
      const cost: Partial<Record<Resource, number>> = { sheep: 1, wheat: 1, ore: 1 };
      if (!canAfford(actor.hand, cost)) return state;
      const card = state.devDeck[0]!;
      const nextDeck = state.devDeck.slice(1);
      const players = state.players.map((p) => {
        if (p.id !== playerId) return p;
        return {
          ...p,
          hand: pay(p.hand, cost),
          devCards: addDevCard(p.devCards, card, 1),
          newDevCards: addDevCard(p.newDevCards, card, 1),
        };
      });
      return checkWin({
        ...state,
        players,
        devDeck: nextDeck,
        ...appendActionLog(state, playerId, 'bought a development card'),
      });
    }
    case 'play-knight': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      if (state.playedDevCardThisTurn) return state;
      if (!canPlayDevCard(actor, 'knight')) return state;
      const players = state.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              devCards: removeDevCard(p.devCards, 'knight', 1),
              playedKnights: p.playedKnights + 1,
            }
          : p
      );
      return recomputeAwards({
        ...state,
        players,
        phase: 'robber-move',
        robberStealTargets: [],
        playedDevCardThisTurn: true,
        ...appendActionLog(state, playerId, 'played Knight'),
      });
    }
    case 'play-road-building': {
      if (state.phase !== 'main-build') return state;
      if (state.playedDevCardThisTurn) return state;
      if (state.roadBuildingRemaining > 0) return state;
      if (!canPlayDevCard(actor, 'road-building')) return state;
      const players = state.players.map((p) =>
        p.id === playerId
          ? { ...p, devCards: removeDevCard(p.devCards, 'road-building', 1) }
          : p
      );
      return {
        ...state,
        players,
        roadBuildingRemaining: 2,
        playedDevCardThisTurn: true,
        ...appendActionLog(state, playerId, 'played Road Building'),
      };
    }
    case 'play-year-of-plenty': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      if (state.playedDevCardThisTurn) return state;
      if (!canPlayDevCard(actor, 'year-of-plenty')) return state;
      const players = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const hand = addResource(addResource(p.hand, action.resourceA, 1), action.resourceB, 1);
        return {
          ...p,
          hand,
          devCards: removeDevCard(p.devCards, 'year-of-plenty', 1),
        };
      });
      return {
        ...state,
        players,
        playedDevCardThisTurn: true,
        ...appendActionLog(state, playerId, 'played Year of Plenty'),
      };
    }
    case 'play-monopoly': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      if (state.playedDevCardThisTurn) return state;
      if (!canPlayDevCard(actor, 'monopoly')) return state;
      let total = 0;
      const players = state.players.map((p) => {
        if (p.id === playerId) return p;
        const count = p.hand[action.resource];
        total += count;
        return { ...p, hand: removeResource(p.hand, action.resource, count) };
      }).map((p) => {
        if (p.id !== playerId) return p;
        return {
          ...p,
          hand: addResource(p.hand, action.resource, total),
          devCards: removeDevCard(p.devCards, 'monopoly', 1),
        };
      });
      return {
        ...state,
        players,
        playedDevCardThisTurn: true,
        ...appendActionLog(state, playerId, `played Monopoly (${RESOURCE_EMOJI[action.resource]})`),
      };
    }
    case 'end-turn': {
      if (state.phase !== 'main-build') return state;
      if (state.roadBuildingRemaining > 0) return state;
      const n = state.players.length;
      const nextPlayer = (state.currentPlayerIndex + 1) % n;
      const next: SettlerState = {
        ...state,
        currentPlayerIndex: nextPlayer,
        phase: 'pre-roll',
        dice: null,
        lastProductionHexIndices: [],
        lastProductionSummary: [],
        playedDevCardThisTurn: false,
        players: state.players.map((p) =>
          p.id === playerId ? { ...p, newDevCards: emptyDevHand() } : p
        ),
        ...appendActionLog(state, playerId, 'ended their turn'),
      };
      return next;
    }
    default:
      return state;
  }
}

export function isSettlerOver(state: unknown): boolean {
  const s = state as SettlerState;
  return s.phase === 'finished';
}

export function getSettlerWinners(state: unknown): string[] {
  const s = state as SettlerState;
  if (s.winnerIds && s.winnerIds.length > 0) return s.winnerIds;
  if (s.phase !== 'finished') return [];
  const max = Math.max(0, ...s.players.map((p) => victoryPoints(s, p.id)));
  return s.players.filter((p) => victoryPoints(s, p.id) === max).map((p) => p.id);
}

export function removeSettlerPlayer(state: SettlerState, playerId: string): SettlerState {
  if (!state.players.some((p) => p.id === playerId)) return state;
  const players = state.players.filter((p) => p.id !== playerId);
  if (players.length === 0) {
    return { ...state, players: [], phase: 'finished', winnerIds: [] };
  }

  const settlements = Object.fromEntries(
    Object.entries(state.settlements).filter(([, piece]) => piece.playerId !== playerId)
  );
  const roads = Object.fromEntries(
    Object.entries(state.roads).filter(([, owner]) => owner !== playerId)
  );
  const discardQueue = state.discardQueue.filter((id) => id !== playerId);
  const discardRequired = { ...state.discardRequired };
  delete discardRequired[playerId];
  const robberStealTargets = state.robberStealTargets.filter((id) => id !== playerId);

  let currentPlayerIndex = state.currentPlayerIndex;
  const currentId = state.players[state.currentPlayerIndex]?.id;
  if (currentId === playerId) {
    currentPlayerIndex = currentPlayerIndex % players.length;
  } else {
    const idx = players.findIndex((p) => p.id === currentId);
    currentPlayerIndex = idx >= 0 ? idx : 0;
  }

  const safeSetupOrder = Math.min(state.setupOrderIndex, Math.max(0, players.length - 1));
  let next: SettlerState = {
    ...state,
    players,
    settlements,
    roads,
    discardQueue,
    discardRequired,
    robberStealTargets,
    currentPlayerIndex,
    setupOrderIndex: safeSetupOrder,
    winnerIds: state.winnerIds ? state.winnerIds.filter((id) => id !== playerId) : null,
    largestArmyHolderId: state.largestArmyHolderId === playerId ? null : state.largestArmyHolderId,
    longestRoadHolderId: state.longestRoadHolderId === playerId ? null : state.longestRoadHolderId,
  };
  next = recomputeAwards(next);
  if (next.players.length === 1) {
    return { ...next, phase: 'finished', winnerIds: [next.players[0]!.id] };
  }
  return checkWin(next);
}

export function removeSettlerPlayerUnknown(state: unknown, playerId: string): unknown {
  return removeSettlerPlayer(state as SettlerState, playerId);
}

export function runSettlerBotTurn(state: unknown, random: () => number = Math.random): unknown {
  const s = state as SettlerState;
  if (s.phase === 'finished') return s;

  let actorIndex = s.currentPlayerIndex;
  if (s.phase === 'discard' && s.discardQueue[0]) {
    actorIndex = s.players.findIndex((p) => p.id === s.discardQueue[0]);
  }
  const actor = s.players[actorIndex];
  const pid = actor?.id;
  if (!pid || !actor?.isBot) return s;

  if (s.phase === 'setup-settlement') {
    const verts = legalSettlementVertices(s, pid, true);
    const v = verts[0];
    if (v === undefined) return s;
    return processSettlerAction(s, { type: 'place-settlement', vertexId: v }, pid, random);
  }
  if (s.phase === 'setup-road') {
    const fv = s.pendingRoadFromVertex;
    const edges = legalRoadEdges(s, pid, true, fv);
    const e = edges[0];
    if (e === undefined) return s;
    return processSettlerAction(s, { type: 'place-road', edgeId: e }, pid, random);
  }
  if (s.phase === 'pre-roll') {
    return processSettlerAction(s, { type: 'roll' }, pid, random);
  }
  if (s.phase === 'discard') {
    const first = s.discardQueue[0];
    if (first !== pid) return s;
    const need = s.discardRequired[pid] ?? 0;
    const pl = s.players.find((p) => p.id === pid);
    if (!pl) return s;
    const cards: Partial<Record<Resource, number>> = {};
    let left = need;
    for (const r of RESOURCE_LIST) {
      if (left <= 0) break;
      const take = Math.min(left, pl.hand[r]);
      if (take > 0) {
        cards[r] = take;
        left -= take;
      }
    }
    if (left > 0) return s;
    return processSettlerAction(s, { type: 'discard', cards }, pid, random);
  }
  if (s.phase === 'robber-move') {
    let bestHex = -1;
    let bestScore = -1;
    for (let hi = 0; hi < s.hexes.length; hi++) {
      if (hi === s.robberHexIndex) continue;
      if (s.hexes[hi]?.terrain === 'desert') continue;
      const cell = graph.hexes[hi];
      if (!cell) continue;
      let score = 0;
      for (const vid of cell.cornerVertexIds) {
        const piece = s.settlements[vid];
        if (!piece || piece.playerId === pid) continue;
        score += piece.kind === 'city' ? 2 : 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestHex = hi;
      }
    }
    if (bestHex < 0) {
      for (let hi = 0; hi < s.hexes.length; hi++) {
        if (hi !== s.robberHexIndex) {
          bestHex = hi;
          break;
        }
      }
    }
    if (bestHex < 0) return s;
    return processSettlerAction(s, { type: 'move-robber', hexIndex: bestHex }, pid, random);
  }
  if (s.phase === 'robber-steal') {
    const t = s.robberStealTargets[0];
    if (!t) return s;
    return processSettlerAction(s, { type: 'steal-from', victimId: t }, pid, random);
  }
  if (s.phase === 'main-build') {
    const pl = s.players.find((p) => p.id === pid);
    if (!pl) return s;
    if (s.roadBuildingRemaining > 0) {
      const edges = legalRoadEdges(s, pid, false, null);
      const e = edges[0];
      if (e !== undefined) {
        return processSettlerAction(s, { type: 'place-free-road', edgeId: e }, pid, random);
      }
      return processSettlerAction(s, { type: 'skip-free-road' }, pid, random);
    }
    if (!s.playedDevCardThisTurn && canPlayDevCard(pl, 'year-of-plenty')) {
      return processSettlerAction(
        s,
        { type: 'play-year-of-plenty', resourceA: 'wheat', resourceB: 'ore' },
        pid,
        random
      );
    }
    if (!s.playedDevCardThisTurn && canPlayDevCard(pl, 'road-building')) {
      return processSettlerAction(s, { type: 'play-road-building' }, pid, random);
    }
    if (canAfford(pl.hand, COSTS.city)) {
      const cityVert = Object.entries(s.settlements).find(
        ([, piece]) => piece.playerId === pid && piece.kind === 'settlement'
      );
      if (cityVert) {
        return processSettlerAction(
          s,
          { type: 'build-city', vertexId: Number(cityVert[0]) },
          pid,
          random
        );
      }
    }
    if (canAfford(pl.hand, COSTS.settlement)) {
      const verts = legalSettlementVertices(s, pid, false);
      const v = verts[0];
      if (v !== undefined) {
        return processSettlerAction(s, { type: 'build-settlement', vertexId: v }, pid, random);
      }
    }
    if (canAfford(pl.hand, COSTS.road)) {
      const edges = legalRoadEdges(s, pid, false, null);
      const e = edges[0];
      if (e !== undefined) {
        return processSettlerAction(s, { type: 'build-road', edgeId: e }, pid, random);
      }
    }
    if (canAfford(pl.hand, { sheep: 1, wheat: 1, ore: 1 }) && s.devDeck.length > 0) {
      return processSettlerAction(s, { type: 'buy-dev-card' }, pid, random);
    }
    if (!s.playedDevCardThisTurn && canPlayDevCard(pl, 'monopoly')) {
      return processSettlerAction(s, { type: 'play-monopoly', resource: 'wheat' }, pid, random);
    }
    for (const give of RESOURCE_LIST) {
      if (pl.hand[give] < 4) continue;
      const receive = RESOURCE_LIST.find((r) => r !== give);
      if (receive) return processSettlerAction(s, { type: 'maritime-trade', give, receive }, pid, random);
    }
    return processSettlerAction(s, { type: 'end-turn' }, pid, random);
  }

  return s;
}

// --- Registry wrappers (unknown payloads) ---

export function createSettlerStateFromPlayers(players: Player[]): SettlerState {
  return createSettlerState(players);
}

export function processSettlerActionUnknown(
  state: unknown,
  action: unknown,
  playerId: string
): unknown {
  if (!state || typeof action !== 'object' || action === null) return state;
  const a = action as { type?: string };
  if (!a.type) return state;
  return processSettlerAction(state as SettlerState, action as SettlerAction, playerId);
}

export function isSettlerOverUnknown(state: unknown): boolean {
  return isSettlerOver(state);
}

export function getSettlerWinnersUnknown(state: unknown): string[] {
  return getSettlerWinners(state);
}

export function runSettlerBotTurnUnknown(state: unknown): unknown {
  return runSettlerBotTurn(state);
}
