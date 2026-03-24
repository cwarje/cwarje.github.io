import type { Player } from '../../networking/types';
import { DEFAULT_BOARD_GRAPH, type BoardGraph } from './layout';
import { harborKindAtVertex, portsFromState, randomPortKindsByCoastalEdgeId } from './ports';
import type {
  SettlerAction,
  SettlerPlayer,
  SettlerState,
  SetupOrderRollState,
  DevCard,
  DevCardHand,
  HexTile,
  Resource,
  ResourceHand,
} from './types';
import {
  COSTS,
  DEV_CARD_COST,
  DEV_DECK,
  emptyHand,
  emptyDevHand,
  handTotal,
  MAX_CITIES_PER_PLAYER,
  MAX_ROADS_PER_PLAYER,
  MAX_SETTLEMENTS_PER_PLAYER,
  NUMBER_DECK,
  RESOURCE_LIST,
  RESOURCE_EMOJI,
  TERRAIN_DECK,
  VP_TO_WIN,
  addResource,
  removeResource,
  depositToBank,
  withdrawFromBank,
  initialBank,
} from './types';

/**
 * Settlers rules engine: `processSettlerAction` applies one move and returns the next `SettlerState`.
 * The board imports exported legality helpers and `victoryPoints`; everything else here is internal
 * (graph checks, production, robber, dev cards, bots, player removal).
 */
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

function repeatResourceEmoji(resource: Resource, amount: number): string {
  const emoji = RESOURCE_EMOJI[resource];
  return Array.from({ length: amount }, () => emoji).join(' ');
}

/** One log row per player who received production this roll (text after "Name: "). */
function productionActionLogEntries(
  s: SettlerState,
  summary: SettlerState['lastProductionSummary']
): { playerId: string; text: string }[] {
  if (summary.length === 0) return [];
  const grouped = new Map<string, string[]>();
  for (const entry of summary) {
    const resourceText = repeatResourceEmoji(entry.resource, entry.amount);
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

// --- Setup phase: snake order and current player slot ---

export function setupCurrentPlayerSlot(s: SettlerState): number {
  const n = s.players.length;
  const slot = s.setupRound === 1 ? s.setupOrderIndex : n - 1 - s.setupOrderIndex;
  const order = s.setupTurnOrder;
  if (order === undefined || order[slot] === undefined) return slot;
  return order[slot]!;
}

function sortIdsByScoreThenSeat(ids: string[], scores: Record<string, number>, players: SettlerPlayer[]): string[] {
  return [...ids].sort((a, b) => {
    const sa = scores[a] ?? 0;
    const sb = scores[b] ?? 0;
    if (sb !== sa) return sb - sa;
    return players.findIndex((p) => p.id === a) - players.findIndex((p) => p.id === b);
  });
}

function findFirstTieRange(
  orderedIds: string[],
  rankScores: Record<string, number>
): { start: number; end: number } | null {
  for (let i = 0; i < orderedIds.length - 1; i++) {
    const sa = rankScores[orderedIds[i]!] ?? 0;
    const sb = rankScores[orderedIds[i + 1]!] ?? 0;
    if (sa === sb) {
      let end = i + 1;
      const t = sa;
      while (end + 1 < orderedIds.length && (rankScores[orderedIds[end + 1]!] ?? 0) === t) {
        end++;
      }
      return { start: i, end };
    }
  }
  return null;
}

function idsInSeatOrder(ids: string[], players: SettlerPlayer[]): string[] {
  return [...ids].sort(
    (a, b) => players.findIndex((p) => p.id === a) - players.findIndex((p) => p.id === b)
  );
}

function firstTieSubsetInWaveSorted(sortedIds: string[], waveScores: Record<string, number>): string[] | null {
  for (let i = 0; i < sortedIds.length - 1; i++) {
    if ((waveScores[sortedIds[i]!] ?? 0) === (waveScores[sortedIds[i + 1]!] ?? 0)) {
      const t = waveScores[sortedIds[i]!] ?? 0;
      let j = i;
      while (j + 1 < sortedIds.length && (waveScores[sortedIds[j + 1]!] ?? 0) === t) {
        j++;
      }
      return sortedIds.slice(i, j + 1);
    }
  }
  return null;
}

function finalizeSetupOrderRoll(s: SettlerState, orderedIds: string[]): SettlerState {
  const setupTurnOrder = orderedIds.map((id) => s.players.findIndex((p) => p.id === id));
  const orderText = orderedIds.map((id) => playerNameById(s, id)).join(', ');
  const logPid = orderedIds[0] ?? s.players[0]!.id;
  let next: SettlerState = {
    ...s,
    phase: 'setup-settlement',
    setupTurnOrder,
    setupOrderRoll: undefined,
    setupRound: 1,
    setupOrderIndex: 0,
    ...appendActionLog(s, logPid, `turn order: ${orderText}`),
  };
  return syncCurrentPlayerForSetup(next);
}

/** After a wave of setup-order rolls completes (`remainingIds` already empty, `waveScores` filled). */
function completeSetupOrderRollWave(state: SettlerState): SettlerState {
  const ord = state.setupOrderRoll;
  if (!ord) return state;
  const { players } = state;
  const waveScores = ord.waveScores;
  const allIds = players.map((p) => p.id);

  if (ord.orderedIds.length === 0) {
    const orderedIds = sortIdsByScoreThenSeat(allIds, waveScores, players);
    const rankScores = { ...waveScores };
    const base: SetupOrderRollState = {
      remainingIds: [],
      waveScores: {},
      orderedIds,
      rankScores,
    };
    const tie = findFirstTieRange(orderedIds, rankScores);
    if (!tie) {
      return finalizeSetupOrderRoll({ ...state, setupOrderRoll: base }, orderedIds);
    }
    const remainingIds = idsInSeatOrder(orderedIds.slice(tie.start, tie.end + 1), players);
    return {
      ...state,
      setupOrderRoll: {
        ...base,
        remainingIds,
        tieResolveRange: tie,
      },
      currentPlayerIndex: players.findIndex((p) => p.id === remainingIds[0]),
    };
  }

  const range = ord.tieResolveRange;
  if (!range) return state;
  const { start, end } = range;
  const rolledIds = Object.keys(waveScores);
  const sortedByWave = sortIdsByScoreThenSeat(rolledIds, waveScores, players);
  const tieAgain = firstTieSubsetInWaveSorted(sortedByWave, waveScores);
  if (tieAgain) {
    const remainingIds = idsInSeatOrder(tieAgain, players);
    return {
      ...state,
      setupOrderRoll: {
        ...ord,
        remainingIds,
        waveScores: {},
        tieResolveRange: range,
      },
      currentPlayerIndex: players.findIndex((p) => p.id === remainingIds[0]),
    };
  }

  const merged = [...ord.orderedIds.slice(0, start), ...sortedByWave, ...ord.orderedIds.slice(end + 1)];
  const rankScores = { ...ord.rankScores };
  for (const id of sortedByWave) {
    const prev = rankScores[id] ?? 0;
    const w = waveScores[id] ?? 0;
    rankScores[id] = prev * 100 + w;
  }

  const nextBase: SetupOrderRollState = {
    remainingIds: [],
    waveScores: {},
    orderedIds: merged,
    rankScores,
  };

  const tie2 = findFirstTieRange(merged, rankScores);
  if (!tie2) {
    return finalizeSetupOrderRoll({ ...state, setupOrderRoll: nextBase }, merged);
  }

  const remainingIds = idsInSeatOrder(merged.slice(tie2.start, tie2.end + 1), players);
  return {
    ...state,
    setupOrderRoll: {
      ...nextBase,
      remainingIds,
      tieResolveRange: tie2,
    },
    currentPlayerIndex: players.findIndex((p) => p.id === remainingIds[0]),
  };
}

function syncCurrentPlayerForSetup(s: SettlerState): SettlerState {
  return { ...s, currentPlayerIndex: setupCurrentPlayerSlot(s) };
}

// --- Board graph: adjacency, connectivity, and placement rules (internal) ---

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

function canAffordPartial(h: ResourceHand, cost: Partial<Record<Resource, number>>): boolean {
  for (const r of RESOURCE_LIST) {
    const c = cost[r] ?? 0;
    if (c < 0) return false;
    if (h[r] < c) return false;
  }
  return true;
}

function payPartial(h: ResourceHand, cost: Partial<Record<Resource, number>>): ResourceHand {
  let next = { ...h };
  for (const r of RESOURCE_LIST) {
    const c = cost[r] ?? 0;
    if (c > 0) next = removeResource(next, r, c);
  }
  return next;
}

function addPartial(h: ResourceHand, add: Partial<Record<Resource, number>>): ResourceHand {
  let next = { ...h };
  for (const r of RESOURCE_LIST) {
    const c = add[r] ?? 0;
    if (c > 0) next = addResource(next, r, c);
  }
  return next;
}

function partialHandTotal(p: Partial<Record<Resource, number>>): number {
  let n = 0;
  for (const r of RESOURCE_LIST) {
    const c = p[r] ?? 0;
    if (c < 0) return -1;
    n += c;
  }
  return n;
}

function depositCostToBank(bank: ResourceHand, cost: Partial<Record<Resource, number>>): ResourceHand {
  let b = bank;
  for (const r of RESOURCE_LIST) {
    const c = cost[r] ?? 0;
    if (c > 0) b = depositToBank(b, r, c);
  }
  return b;
}

function depositHandToBank(bank: ResourceHand, hand: ResourceHand): ResourceHand {
  let b = bank;
  for (const r of RESOURCE_LIST) {
    const n = hand[r];
    if (n > 0) b = depositToBank(b, r, n);
  }
  return b;
}

function addDevCard(h: DevCardHand, card: DevCard, n: number): DevCardHand {
  return { ...h, [card]: h[card] + n };
}

function removeDevCard(h: DevCardHand, card: DevCard, n: number): DevCardHand {
  return { ...h, [card]: Math.max(0, h[card] - n) };
}

export function canPlayDevCard(pl: SettlerPlayer, card: Exclude<DevCard, 'victory-point'>): boolean {
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

// --- Longest road, largest army, and VP (used after builds and player changes) ---

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

/** VP from board + special cards only (excludes hidden victory-point dev cards). */
export function visibleVictoryPoints(s: SettlerState, playerId: string): number {
  let vp = 0;
  for (const piece of Object.values(s.settlements)) {
    if (piece.playerId !== playerId) continue;
    vp += piece.kind === 'city' ? 2 : 1;
  }
  if (s.longestRoadHolderId === playerId) vp += 2;
  if (s.largestArmyHolderId === playerId) vp += 2;
  return vp;
}

export function victoryPoints(s: SettlerState, playerId: string): number {
  const player = s.players.find((p) => p.id === playerId);
  const hiddenVp = player?.devCards['victory-point'] ?? 0;
  return visibleVictoryPoints(s, playerId) + hiddenVp;
}

/**
 * Win only on the active player's turn when they reach `VP_TO_WIN` (base-game timing).
 */
function checkWin(s: SettlerState, actorId: string): SettlerState {
  if (!actorId) return s;
  const cur = s.players[s.currentPlayerIndex]?.id;
  if (actorId !== cur) return s;
  if (victoryPoints(s, actorId) >= VP_TO_WIN) {
    return { ...s, phase: 'finished', winnerIds: [actorId] };
  }
  return s;
}

/** Ratios the active player may use when trading `give` to the bank (always 4:1; 3:1 with generic port; 2:1 with matching special). */
export function legalMaritimeRatiosForGive(
  s: SettlerState,
  playerId: string,
  give: Resource
): (2 | 3 | 4)[] {
  let hasGeneric = false;
  let hasSpecialForGive = false;
  for (const [vidStr, piece] of Object.entries(s.settlements)) {
    if (piece.playerId !== playerId) continue;
    const harbor = harborKindAtVertex(Number(vidStr), graph, portsFromState(s));
    if (!harbor) continue;
    if (harbor.kind === 'generic-3') hasGeneric = true;
    else if (harbor.resource === give) hasSpecialForGive = true;
  }
  const ratios = new Set<2 | 3 | 4>([4]);
  if (hasGeneric) ratios.add(3);
  if (hasSpecialForGive) ratios.add(2);
  return [...ratios].sort((a, b) => a - b);
}

// --- Bank / hands: second settlement bonus, production vs 7, discard queue before robber ---

function grantSecondSettlementResources(s: SettlerState, vertexId: number): SettlerState {
  const vid = vertexId;
  const v = graph.vertices[vid];
  if (!v) return s;
  const pid = s.settlements[vid]?.playerId;
  if (!pid) return s;

  let bank = { ...s.bank };
  let players = s.players.map((pl) => {
    if (pl.id !== pid) return pl;
    let hand = { ...pl.hand };
    for (const hi of v.hexIndices) {
      const hex = s.hexes[hi];
      if (!hex) continue;
      const res = terrainToResource(hex.terrain);
      if (!res) continue;
      const w = withdrawFromBank(bank, res, 1);
      bank = w.bank;
      if (w.taken > 0) hand = addResource(hand, res, w.taken);
    }
    return { ...pl, hand };
  });
  return { ...s, players, bank };
}

/**
 * Total cards needed from the bank per resource this production roll. If demand[r] > bank[r],
 * standard rules: nobody receives resource `r` this roll (no partial payouts).
 */
function productionDemandForRoll(s: SettlerState, sum: number): { producedHexIndices: number[]; demand: ResourceHand } {
  const demand: ResourceHand = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const producedHexIndices: number[] = [];

  for (let hi = 0; hi < s.hexes.length; hi++) {
    const hex = s.hexes[hi];
    if (!hex || hex.terrain === 'desert') continue;
    if (hi === s.robberHexIndex) continue;
    if (hex.numberToken !== sum) continue;

    producedHexIndices.push(hi);
    const res = terrainToResource(hex.terrain);
    if (!res) continue;

    const cell = graph.hexes[hi];
    if (!cell) continue;
    for (const vid of cell.cornerVertexIds) {
      const piece = s.settlements[vid];
      if (!piece) continue;
      demand[res] += piece.kind === 'city' ? 2 : 1;
    }
  }

  return { producedHexIndices, demand };
}

function applyProduction(s: SettlerState, sum: number): SettlerState {
  if (sum === 7) return { ...s, lastProductionHexIndices: [], lastProductionSummary: [] };

  const { producedHexIndices, demand } = productionDemandForRoll(s, sum);
  const blocked = new Set<Resource>();
  for (const r of RESOURCE_LIST) {
    if (demand[r] > s.bank[r]) blocked.add(r);
  }

  const producedByPlayer = new Map<string, Partial<Record<Resource, number>>>();
  let bank = { ...s.bank };
  let players = s.players.map((p) => ({ ...p, hand: { ...p.hand } }));

  for (const hi of producedHexIndices) {
    const hex = s.hexes[hi];
    if (!hex) continue;
    const res = terrainToResource(hex.terrain);
    if (!res || blocked.has(res)) continue;

    const cell = graph.hexes[hi];
    if (!cell) continue;
    for (const vid of cell.cornerVertexIds) {
      const piece = s.settlements[vid];
      if (!piece) continue;
      const want = piece.kind === 'city' ? 2 : 1;
      const pi = players.findIndex((x) => x.id === piece.playerId);
      if (pi < 0) continue;
      const pl = players[pi]!;
      let gained = 0;
      for (let u = 0; u < want; u++) {
        const w = withdrawFromBank(bank, res, 1);
        bank = w.bank;
        gained += w.taken;
      }
      if (gained > 0) {
        players[pi] = { ...pl, hand: addResource(pl.hand, res, gained) };
        const prev = producedByPlayer.get(piece.playerId) ?? {};
        producedByPlayer.set(piece.playerId, { ...prev, [res]: (prev[res] ?? 0) + gained });
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

  return { ...s, players, bank, lastProductionHexIndices: producedHexIndices, lastProductionSummary };
}

function buildDiscardState(s: SettlerState): SettlerState {
  const required: Record<string, number> = {};
  const rollerIdx = s.currentPlayerIndex;
  const n = s.players.length;
  const queue: string[] = [];
  for (let k = 0; k < n; k++) {
    const pid = s.players[(rollerIdx + k) % n]!.id;
    const p = s.players.find((x) => x.id === pid);
    if (!p) continue;
    const t = handTotal(p.hand);
    if (t > 7) {
      queue.push(pid);
      required[pid] = Math.floor(t / 2);
    }
  }
  if (queue.length === 0) {
    return { ...s, phase: 'robber-move' };
  }
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

// --- New game: shuffle board, bank, dev deck, start in setup ---

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

  const setupOrderRoll: SetupOrderRollState = {
    remainingIds: players.map((p) => p.id),
    waveScores: {},
    orderedIds: [],
    rankScores: {},
  };

  const s: SettlerState = {
    players,
    hexes,
    robberHexIndex: robberHexIndex >= 0 ? robberHexIndex : 0,
    settlements: {},
    roads: {},
    bank: initialBank(),
    currentPlayerIndex: 0,
    phase: 'setup-order-roll',
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
    pendingDomesticTrade: null,
    portKindsByCoastalEdgeId: randomPortKindsByCoastalEdgeId(graph, random),
    turnDeadlineAt: null,
    setupOrderRoll,
    setupOrderDisplayRollerId: null,
  };
  return s;
}

// --- Piece supply (base game) ---

export function countPlayerRoads(s: SettlerState, playerId: string): number {
  let n = 0;
  for (const owner of Object.values(s.roads)) {
    if (owner === playerId) n++;
  }
  return n;
}

export function countPlayerSettlements(s: SettlerState, playerId: string): number {
  let n = 0;
  for (const piece of Object.values(s.settlements)) {
    if (piece.playerId === playerId && piece.kind === 'settlement') n++;
  }
  return n;
}

export function countPlayerCities(s: SettlerState, playerId: string): number {
  let n = 0;
  for (const piece of Object.values(s.settlements)) {
    if (piece.playerId === playerId && piece.kind === 'city') n++;
  }
  return n;
}

// --- Exported legality (SettlerBoard highlights and button disabled states) ---

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
  if (!setup && countPlayerSettlements(s, playerId) >= MAX_SETTLEMENTS_PER_PLAYER) {
    return [];
  }
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
  if (countPlayerRoads(s, playerId) >= MAX_ROADS_PER_PLAYER) {
    return [];
  }
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

/**
 * Single reducer step: validates phase, actor, and action, then returns immutably updated state.
 * Discard is handled first (actor is discardQueue[0]); all other actions require currentPlayerIndex.
 */
export function processSettlerAction(
  state: SettlerState,
  action: SettlerAction,
  playerId: string,
  random: () => number = Math.random
): SettlerState {
  if (state.phase === 'finished') return state;

  if (action.type === 'respond-domestic-trade') {
    const pending = state.pendingDomesticTrade;
    if (!pending || pending.targetId !== playerId) return state;
    if (!action.accept) {
      return {
        ...state,
        pendingDomesticTrade: null,
        ...appendActionLog(state, playerId, 'declined trade'),
      };
    }
    const proposer = state.players.find((p) => p.id === pending.proposerId);
    const targetPl = state.players.find((p) => p.id === pending.targetId);
    if (!proposer || !targetPl) {
      return { ...state, pendingDomesticTrade: null };
    }
    if (!canAffordPartial(proposer.hand, pending.give) || !canAffordPartial(targetPl.hand, pending.want)) {
      return {
        ...state,
        pendingDomesticTrade: null,
        ...appendActionLog(state, playerId, 'trade failed (resources changed)'),
      };
    }
    const players = state.players.map((p) => {
      if (p.id === pending.proposerId) {
        const hand = addPartial(payPartial(p.hand, pending.give), pending.want);
        return { ...p, hand };
      }
      if (p.id === pending.targetId) {
        const hand = addPartial(payPartial(p.hand, pending.want), pending.give);
        return { ...p, hand };
      }
      return p;
    });
    return {
      ...state,
      players,
      pendingDomesticTrade: null,
      ...appendActionLog(
        state,
        pending.proposerId,
        `traded with ${playerNameById(state, pending.targetId)}`
      ),
    };
  }

  if (action.type === 'cancel-domestic-trade') {
    const pending = state.pendingDomesticTrade;
    if (!pending || pending.proposerId !== playerId) return state;
    if (state.players[state.currentPlayerIndex]?.id !== playerId) return state;
    return {
      ...state,
      pendingDomesticTrade: null,
      ...appendActionLog(state, playerId, 'cancelled trade offer'),
    };
  }

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
    let bank = { ...state.bank };
    for (const r of RESOURCE_LIST) {
      const d = cards[r] ?? 0;
      if (hand[r] < d) return state;
      hand = removeResource(hand, r, d);
      if (d > 0) bank = depositToBank(bank, r, d);
    }

    let players = state.players.map((p) => (p.id === playerId ? { ...p, hand } : p));
    let discardQueue = state.discardQueue.slice(1);
    let discardRequired = { ...state.discardRequired };
    delete discardRequired[playerId];

    let next: SettlerState = {
      ...state,
      players,
      bank,
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
    case 'roll-setup-order': {
      if (state.phase !== 'setup-order-roll') return state;
      const ord = state.setupOrderRoll;
      if (!ord || ord.remainingIds[0] !== playerId) return state;
      const d1 = 1 + Math.floor(random() * 6);
      const d2 = 1 + Math.floor(random() * 6);
      const sum = d1 + d2;
      const rollText = `${diceRollActionLogText(d1, d2)} for turn order (${sum})`;
      const newWaveScores = { ...ord.waveScores, [playerId]: sum };
      const newRemaining = ord.remainingIds.slice(1);
      let next: SettlerState = {
        ...state,
        dice: { d1, d2 },
        setupOrderDisplayRollerId: playerId,
        setupOrderRoll: {
          ...ord,
          waveScores: newWaveScores,
          remainingIds: newRemaining,
        },
        ...appendActionLog(state, playerId, rollText),
      };
      if (newRemaining.length > 0) {
        const nextPid = newRemaining[0]!;
        return {
          ...next,
          currentPlayerIndex: state.players.findIndex((p) => p.id === nextPid),
        };
      }
      return completeSetupOrderRollWave(next);
    }
    case 'place-settlement': {
      if (state.phase !== 'setup-settlement') return state;
      if (countPlayerSettlements(state, playerId) >= MAX_SETTLEMENTS_PER_PLAYER) return state;
      const vid = action.vertexId;
      if (!graph.vertices[vid]) return state;
      if (state.settlements[vid] !== undefined) return state;
      if (neighborSettlementsExist(state, vid)) return state;

      let next: SettlerState = {
        ...state,
        settlements: { ...state.settlements, [vid]: { playerId, kind: 'settlement' } },
        phase: 'setup-road',
        setupOrderDisplayRollerId: null,
        dice: null,
        pendingRoadFromVertex: vid,
        ...appendActionLog(state, playerId, 'placed a settlement'),
      };
      next = syncCurrentPlayerForSetup(next);
      if (state.setupRound === 2) {
        next = grantSecondSettlementResources(next, vid);
      }
      return checkWin(next, playerId);
    }
    case 'place-road': {
      if (state.phase !== 'setup-road') return state;
      if (countPlayerRoads(state, playerId) >= MAX_ROADS_PER_PLAYER) return state;
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
        return checkWin(next, playerId);
      } else if (state.setupRound === 2 && state.setupOrderIndex === n - 1) {
        const firstIdx = state.setupTurnOrder?.[0] ?? 0;
        next = {
          ...next,
          phase: 'pre-roll',
          setupOrderDisplayRollerId: null,
          setupRound: 1,
          setupOrderIndex: 0,
          currentPlayerIndex: firstIdx,
          pendingRoadFromVertex: null,
        };
        return checkWin(next, playerId);
      }
      next = { ...next, setupOrderIndex: state.setupOrderIndex + 1 };
      next = syncCurrentPlayerForSetup(next);
      return checkWin(next, playerId);
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
        next = checkWin(next, playerId);
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
      return checkWin(next, playerId);
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
      return checkWin(next, playerId);
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
        bank: depositCostToBank(state.bank, COSTS.road),
        ...appendActionLog(state, playerId, 'built a road'),
      });
      return checkWin(next, playerId);
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
      return checkWin(next, playerId);
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
        bank: depositCostToBank(state.bank, COSTS.settlement),
        ...appendActionLog(state, playerId, 'built a settlement'),
      };
      return checkWin(next, playerId);
    }
    case 'build-city': {
      if (state.phase !== 'main-build') return state;
      if (state.roadBuildingRemaining > 0) return state;
      if (countPlayerCities(state, playerId) >= MAX_CITIES_PER_PLAYER) return state;
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
        bank: depositCostToBank(state.bank, COSTS.city),
        ...appendActionLog(state, playerId, 'built a city'),
      };
      return checkWin(next, playerId);
    }
    case 'maritime-trade': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      const { give, receive, ratio } = action;
      if (give === receive) return state;
      const legal = legalMaritimeRatiosForGive(state, playerId, give);
      if (!legal.includes(ratio)) return state;
      if (actor.hand[give] < ratio) return state;
      if (state.bank[receive] < 1) return state;
      let bank = depositToBank(state.bank, give, ratio);
      const w = withdrawFromBank(bank, receive, 1);
      bank = w.bank;
      if (w.taken < 1) return state;
      const players = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const hand = addResource(removeResource(p.hand, give, ratio), receive, 1);
        return { ...p, hand };
      });
      return {
        ...state,
        players,
        bank,
        ...appendActionLog(
          state,
          playerId,
          `traded ${repeatResourceEmoji(give, ratio)} for ${RESOURCE_EMOJI[receive]}`
        ),
      };
    }
    case 'propose-domestic-trade': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      const { targetId, give, want } = action;
      if (targetId === playerId) return state;
      if (!state.players.some((p) => p.id === targetId)) return state;
      if (partialHandTotal(give) <= 0 || partialHandTotal(want) <= 0) return state;
      if (!canAffordPartial(actor.hand, give)) return state;
      let next: SettlerState = {
        ...state,
        pendingDomesticTrade: { proposerId: playerId, targetId, give, want },
        ...appendActionLog(
          state,
          playerId,
          `offered trade to ${playerNameById(state, targetId)}`
        ),
      };
      const targetPlayer = state.players.find((p) => p.id === targetId);
      if (targetPlayer?.isBot) {
        next = {
          ...next,
          pendingDomesticTrade: null,
          ...appendActionLog(next, targetId, 'declined trade'),
        };
      }
      return next;
    }
    case 'buy-dev-card': {
      if (state.phase !== 'main-build' || state.roadBuildingRemaining > 0) return state;
      if (state.devDeck.length === 0) return state;
      if (!canAfford(actor.hand, DEV_CARD_COST)) return state;
      const card = state.devDeck[0]!;
      const nextDeck = state.devDeck.slice(1);
      const players = state.players.map((p) => {
        if (p.id !== playerId) return p;
        return {
          ...p,
          hand: pay(p.hand, DEV_CARD_COST),
          devCards: addDevCard(p.devCards, card, 1),
          newDevCards: addDevCard(p.newDevCards, card, 1),
        };
      });
      const bought: SettlerState = {
        ...state,
        players,
        bank: depositCostToBank(state.bank, DEV_CARD_COST),
        devDeck: nextDeck,
        ...appendActionLog(state, playerId, 'bought a development card'),
      };
      return checkWin(bought, playerId);
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
      return checkWin(
        recomputeAwards({
          ...state,
          players,
          phase: 'robber-move',
          robberStealTargets: [],
          playedDevCardThisTurn: true,
          ...appendActionLog(state, playerId, 'played Knight'),
        }),
        playerId
      );
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
      let bank = { ...state.bank };
      let gainedA = 0;
      let gainedB = 0;
      const w1 = withdrawFromBank(bank, action.resourceA, 1);
      bank = w1.bank;
      gainedA = w1.taken;
      const w2 = withdrawFromBank(bank, action.resourceB, 1);
      bank = w2.bank;
      gainedB = w2.taken;
      if (gainedA + gainedB < 1) return state;
      const players = state.players.map((p) => {
        if (p.id !== playerId) return p;
        let hand = p.hand;
        if (gainedA > 0) hand = addResource(hand, action.resourceA, gainedA);
        if (gainedB > 0) hand = addResource(hand, action.resourceB, gainedB);
        return {
          ...p,
          hand,
          devCards: removeDevCard(p.devCards, 'year-of-plenty', 1),
        };
      });
      return {
        ...state,
        players,
        bank,
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
      const winFirst = checkWin(state, playerId);
      if (winFirst.phase === 'finished') return winFirst;
      const n = state.players.length;
      const nextPlayer = (state.currentPlayerIndex + 1) % n;
      const next: SettlerState = {
        ...state,
        currentPlayerIndex: nextPlayer,
        phase: 'pre-roll',
        setupOrderDisplayRollerId: null,
        dice: null,
        lastProductionHexIndices: [],
        lastProductionSummary: [],
        playedDevCardThisTurn: false,
        pendingDomesticTrade: null,
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

// --- Match status (host / lobby wrappers use the `Unknown` variants below) ---

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

// --- Remove a player mid-game: return pieces to bank, fix indices, recompute awards ---

export function removeSettlerPlayer(state: SettlerState, playerId: string): SettlerState {
  if (!state.players.some((p) => p.id === playerId)) return state;
  const removedPl = state.players.find((p) => p.id === playerId);
  const bankAfterRemove = removedPl ? depositHandToBank(state.bank, removedPl.hand) : state.bank;
  const players = state.players.filter((p) => p.id !== playerId);
  if (players.length === 0) {
    return { ...state, players: [], phase: 'finished', winnerIds: [], bank: bankAfterRemove };
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

  let pendingDomesticTrade = state.pendingDomesticTrade;
  if (
    pendingDomesticTrade &&
    (pendingDomesticTrade.proposerId === playerId || pendingDomesticTrade.targetId === playerId)
  ) {
    pendingDomesticTrade = null;
  }

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
    bank: bankAfterRemove,
    discardQueue,
    discardRequired,
    robberStealTargets,
    currentPlayerIndex,
    setupOrderIndex: safeSetupOrder,
    winnerIds: state.winnerIds ? state.winnerIds.filter((id) => id !== playerId) : null,
    largestArmyHolderId: state.largestArmyHolderId === playerId ? null : state.largestArmyHolderId,
    longestRoadHolderId: state.longestRoadHolderId === playerId ? null : state.longestRoadHolderId,
    pendingDomesticTrade,
  };
  next = recomputeAwards(next);
  if (next.players.length === 1) {
    return { ...next, phase: 'finished', winnerIds: [next.players[0]!.id] };
  }
  let withOrder = next;
  if (withOrder.phase === 'setup-order-roll') {
    const ids = withOrder.players.map((p) => p.id);
    withOrder = {
      ...withOrder,
      setupOrderRoll: {
        remainingIds: [...ids],
        waveScores: {},
        orderedIds: [],
        rankScores: {},
      },
      setupOrderDisplayRollerId: null,
      setupTurnOrder: undefined,
      currentPlayerIndex: 0,
    };
  } else if (withOrder.setupOrderDisplayRollerId != null) {
    withOrder = { ...withOrder, setupOrderDisplayRollerId: null };
  } else if (withOrder.setupTurnOrder) {
    const remapped = withOrder.setupTurnOrder
      .map((idx) => {
        const id = state.players[idx]?.id;
        if (!id || id === playerId) return -1;
        return withOrder.players.findIndex((p) => p.id === id);
      })
      .filter((i) => i >= 0);
    const n = withOrder.players.length;
    if (remapped.length === n) {
      withOrder = { ...withOrder, setupTurnOrder: remapped };
    } else {
      withOrder = { ...withOrder, setupTurnOrder: withOrder.players.map((_, i) => i) };
    }
  }

  const curId = withOrder.players[withOrder.currentPlayerIndex]?.id ?? '';
  return checkWin(withOrder, curId);
}

export function removeSettlerPlayerUnknown(state: unknown, playerId: string): unknown {
  return removeSettlerPlayer(state as SettlerState, playerId);
}

/** Wall-clock turn budget for human idle resolution after dice are rolled (ms). */
export const SETTLER_TURN_LIMIT_MS = 120_000;

/** Short window for the current player to roll before an automatic roll (ms). */
export const SETTLER_PRE_ROLL_LIMIT_MS = 10_000;

/** Default deadline duration for the current phase (10s pre-roll, 2min elsewhere). */
export function settlerDeadlineLimitMs(state: SettlerState): number {
  return state.phase === 'pre-roll' || state.phase === 'setup-order-roll'
    ? SETTLER_PRE_ROLL_LIMIT_MS
    : SETTLER_TURN_LIMIT_MS;
}

/** Player who must act for the turn timer: trade target, discard head, or current player. */
export function getSettlerIdleActorId(s: SettlerState): string | null {
  if (s.phase === 'finished') return null;
  const pending = s.pendingDomesticTrade;
  if (pending) return pending.targetId;
  if (s.phase === 'discard') return s.discardQueue[0] ?? null;
  return s.players[s.currentPlayerIndex]?.id ?? null;
}

export function assignSettlerTurnDeadline(
  state: SettlerState,
  nowMs: number,
  limitMs?: number
): SettlerState {
  if (state.phase === 'finished') {
    return { ...state, turnDeadlineAt: null };
  }
  const pid = getSettlerIdleActorId(state);
  if (!pid) return { ...state, turnDeadlineAt: null };
  const pl = state.players.find((p) => p.id === pid);
  if (!pl || pl.isBot) return { ...state, turnDeadlineAt: null };
  const lim = limitMs ?? settlerDeadlineLimitMs(state);
  return { ...state, turnDeadlineAt: nowMs + lim };
}

export function reconcileSettlerTurnDeadlineAfterAction(
  prev: SettlerState,
  next: SettlerState,
  nowMs: number
): SettlerState {
  if (next.phase === 'finished') {
    return assignSettlerTurnDeadline(next, nowMs);
  }
  const idleNext = getSettlerIdleActorId(next);
  if (!idleNext) {
    return { ...next, turnDeadlineAt: null };
  }
  const plNext = next.players.find((p) => p.id === idleNext);
  if (!plNext || plNext.isBot) {
    return { ...next, turnDeadlineAt: null };
  }

  const idlePrev = getSettlerIdleActorId(prev);
  if (idlePrev !== idleNext) {
    return assignSettlerTurnDeadline(next, nowMs);
  }

  const prevShort = prev.phase === 'pre-roll' || prev.phase === 'setup-order-roll';
  const nextShort = next.phase === 'pre-roll' || next.phase === 'setup-order-roll';
  if (prevShort && !nextShort) {
    return assignSettlerTurnDeadline(next, nowMs);
  }

  const prevDeadline = prev.turnDeadlineAt;
  if (prevDeadline == null || prevDeadline <= nowMs) {
    return assignSettlerTurnDeadline(next, nowMs);
  }

  return { ...next, turnDeadlineAt: prevDeadline };
}

function pickRobberMoveHex(s: SettlerState, rollerId: string): number {
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
      if (!piece || piece.playerId === rollerId) continue;
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
        return hi;
      }
    }
  }
  return bestHex;
}

/**
 * Host-only: apply one forced action for an idle human. Pre-roll auto-rolls without an `is asleep`
 * log; other phases log `is asleep` first (skip/end-turn / unblock path).
 */
export function applySettlerIdleTimeout(
  state: SettlerState,
  random: () => number = Math.random
): SettlerState {
  if (state.phase === 'finished') return state;

  const pid = getSettlerIdleActorId(state);
  if (!pid) return state;
  const actorPl = state.players.find((p) => p.id === pid);
  if (!actorPl || actorPl.isBot) return state;

  if (state.phase === 'pre-roll') {
    return processSettlerAction(state, { type: 'roll' }, pid, random);
  }
  if (state.phase === 'setup-order-roll') {
    return processSettlerAction(state, { type: 'roll-setup-order' }, pid, random);
  }

  const pending = state.pendingDomesticTrade;
  if (pending && pid === pending.targetId) {
    return {
      ...state,
      pendingDomesticTrade: null,
      ...appendActionLog(state, pid, 'is asleep (declined the trade)'),
    };
  }

  let forced: SettlerAction | null = null;
  switch (state.phase) {
    case 'setup-settlement': {
      const verts = legalSettlementVertices(state, pid, true);
      const v = verts[0];
      if (v !== undefined) forced = { type: 'place-settlement', vertexId: v };
      break;
    }
    case 'setup-road': {
      const fv = state.pendingRoadFromVertex;
      const edges = legalRoadEdges(state, pid, true, fv);
      const e = edges[0];
      if (e !== undefined) forced = { type: 'place-road', edgeId: e };
      break;
    }
    case 'discard': {
      if (state.discardQueue[0] !== pid) break;
      const need = state.discardRequired[pid] ?? 0;
      const pl = state.players.find((p) => p.id === pid);
      if (!pl) break;
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
      if (left <= 0) forced = { type: 'discard', cards };
      break;
    }
    case 'robber-move': {
      const hi = pickRobberMoveHex(state, pid);
      if (hi >= 0) forced = { type: 'move-robber', hexIndex: hi };
      break;
    }
    case 'robber-steal': {
      const t = state.robberStealTargets[0];
      if (t !== undefined) forced = { type: 'steal-from', victimId: t };
      break;
    }
    case 'main-build':
      forced =
        state.roadBuildingRemaining > 0
          ? { type: 'skip-free-road' }
          : { type: 'end-turn' };
      break;
    default:
      break;
  }

  if (forced === null) return state;

  const withSleep: SettlerState = { ...state, ...appendActionLog(state, pid, 'is asleep') };
  return processSettlerAction(withSleep, forced, pid, random);
}

function pickYearOfPlentyPair(bank: ResourceHand): { resourceA: Resource; resourceB: Resource } | null {
  const stocked = RESOURCE_LIST.filter((r) => bank[r] > 0);
  if (stocked.length === 0) return null;
  const resourceA = stocked[0]!;
  const resourceB = stocked.length >= 2 ? stocked[1]! : stocked[0]!;
  return { resourceA, resourceB };
}

// --- Bot: one greedy action for the current actor (or discard-queue head) ---

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

  if (s.phase === 'setup-order-roll') {
    return processSettlerAction(s, { type: 'roll-setup-order' }, pid, random);
  }
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
    const bestHex = pickRobberMoveHex(s, pid);
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
      const pair = pickYearOfPlentyPair(s.bank);
      if (pair) {
        return processSettlerAction(s, { type: 'play-year-of-plenty', ...pair }, pid, random);
      }
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
    if (canAfford(pl.hand, DEV_CARD_COST) && s.devDeck.length > 0) {
      return processSettlerAction(s, { type: 'buy-dev-card' }, pid, random);
    }
    if (!s.playedDevCardThisTurn && canPlayDevCard(pl, 'monopoly')) {
      return processSettlerAction(s, { type: 'play-monopoly', resource: 'wheat' }, pid, random);
    }
    for (const give of RESOURCE_LIST) {
      const legal = legalMaritimeRatiosForGive(s, pid, give);
      const ratio = legal[0];
      if (ratio === undefined || pl.hand[give] < ratio) continue;
      const receive = RESOURCE_LIST.find((r) => r !== give && s.bank[r] > 0);
      if (receive) {
        return processSettlerAction(
          s,
          { type: 'maritime-trade', give, receive, ratio },
          pid,
          random
        );
      }
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
