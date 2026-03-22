import {
  type BoardGraph,
  DEFAULT_BOARD_GRAPH,
  orderedCoastalEdges,
  pickPortCoastalEdge,
} from './layout';
import type { HarborKind, SettlerState } from './types';

/**
 * Fixed port sites on `DEFAULT_BOARD_GRAPH` (legacy layout). Vertex keys are converted to coastal
 * edge ids via `pickPortCoastalEdge` when hydrating old state.
 */
export const LEGACY_PORTS_BY_VERTEX_ID: Readonly<Record<number, HarborKind>> = {
  2: { kind: 'generic-3' },
  5: { kind: 'special-2', resource: 'brick' },
  27: { kind: 'generic-3' },
  40: { kind: 'special-2', resource: 'wood' },
  47: { kind: 'special-2', resource: 'sheep' },
  51: { kind: 'generic-3' },
  45: { kind: 'special-2', resource: 'wheat' },
  36: { kind: 'special-2', resource: 'ore' },
  24: { kind: 'generic-3' },
};

/** @deprecated Use `portsFromState` / edge-keyed maps. */
export const PORTS_BY_VERTEX_ID = LEGACY_PORTS_BY_VERTEX_ID;

export const STANDARD_HARBOR_DECK: HarborKind[] = [
  { kind: 'generic-3' },
  { kind: 'generic-3' },
  { kind: 'generic-3' },
  { kind: 'generic-3' },
  { kind: 'special-2', resource: 'brick' },
  { kind: 'special-2', resource: 'wood' },
  { kind: 'special-2', resource: 'sheep' },
  { kind: 'special-2', resource: 'wheat' },
  { kind: 'special-2', resource: 'ore' },
];

function legacyVertexPortsToEdgeMap(graph: BoardGraph): Record<string, HarborKind> {
  const out: Record<string, HarborKind> = {};
  for (const [vidStr, kind] of Object.entries(LEGACY_PORTS_BY_VERTEX_ID)) {
    const e = pickPortCoastalEdge(graph, Number(vidStr));
    if (e) out[e.id] = kind;
  }
  return out;
}

/**
 * Coastal edge id -> harbor kind. Falls back to legacy fixed layout when state has no port field.
 */
export function portsFromState(s: SettlerState): Readonly<Record<string, HarborKind>> {
  if (s.portKindsByCoastalEdgeId && Object.keys(s.portKindsByCoastalEdgeId).length > 0) {
    return s.portKindsByCoastalEdgeId;
  }
  return legacyVertexPortsToEdgeMap(DEFAULT_BOARD_GRAPH);
}

function shuffleArray<T>(arr: T[], random: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/**
 * Random harbor placement: nine ports on coastal hex sides with at least **two** empty sides
 * between any two docks on the perimeter cycle (cyclic index gap ≥ 3), kinds shuffled.
 */
export function randomPortKindsByCoastalEdgeId(
  graph: BoardGraph,
  random: () => number,
): Record<string, HarborKind> {
  const ordered = orderedCoastalEdges(graph);
  const L = ordered.length;
  /** Need room for 9 docks with min cyclic distance 3 ⇒ L ≥ 27. */
  if (L < 27) {
    throw new Error(`randomPortKindsByCoastalEdgeId: coastal cycle length ${L} < 27`);
  }

  const start = Math.floor(random() * 3);
  const pool: number[] = [];
  for (let i = start; i < L; i += 3) {
    pool.push(i);
  }
  if (pool.length < 9) {
    throw new Error(`randomPortKindsByCoastalEdgeId: stride-3 pool size ${pool.length} < 9`);
  }

  const chosenIndices = shuffleArray(pool, random).slice(0, 9);
  const kinds = shuffleArray([...STANDARD_HARBOR_DECK], random);

  const out: Record<string, HarborKind> = {};
  for (let k = 0; k < 9; k++) {
    const edge = ordered[chosenIndices[k]!]!;
    out[edge.id] = kinds[k]!;
  }
  return out;
}

export function portDockVertexIdSet(
  graph: BoardGraph,
  ports: Readonly<Record<string, HarborKind>>,
): Set<number> {
  const s = new Set<number>();
  for (const eid of Object.keys(ports)) {
    const e = graph.edgeById.get(eid);
    if (!e) continue;
    s.add(e.a);
    s.add(e.b);
  }
  return s;
}

/** Harbor if this vertex touches a port coastal edge. */
export function harborKindAtVertex(
  vertexId: number,
  graph: BoardGraph,
  ports: Readonly<Record<string, HarborKind>>,
): HarborKind | undefined {
  for (const e of graph.edges) {
    if (e.a !== vertexId && e.b !== vertexId) continue;
    if (e.hexIndices.length !== 1) continue;
    const k = ports[e.id];
    if (k) return k;
  }
  return undefined;
}
