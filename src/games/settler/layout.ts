/**
 * Standard 19-hex flower (radius-2 disc) in axial coords (q, r), flat-top hexes.
 * See https://www.redblobgames.com/grids/hexagons/
 */

const SQRT3 = Math.sqrt(3);

/** Axial directions: index i = corner i shares edge with neighbor in direction i */
export const AXIAL_DIRS: readonly { q: number; r: number }[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export interface Axial {
  q: number;
  r: number;
}

export interface HexLayoutCell {
  index: number;
  q: number;
  r: number;
  /** Pixel center (flat-top, circumradius = size) */
  cx: number;
  cy: number;
  /** Vertex ids around this hex, clockwise from corner 0 (E-most corner for flat-top) */
  cornerVertexIds: number[];
}

export interface VertexLayout {
  id: number;
  x: number;
  y: number;
  /** Land hex indices (0..18) touching this vertex */
  hexIndices: number[];
}

export interface EdgeLayout {
  id: string;
  a: number;
  b: number;
  /** Land hex indices sharing this edge (1 or 2) */
  hexIndices: number[];
}

function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** All axial cells within hex distance `radius` of origin (19 cells when radius=2). */
export function axialDisc(radius: number): Axial[] {
  const out: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      const dist = (Math.abs(q) + Math.abs(r) + Math.abs(s)) / 2;
      if (dist <= radius) out.push({ q, r });
    }
  }
  return out;
}

function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * (3 / 2) * q,
    y: size * SQRT3 * (r + q / 2),
  };
}

/** Flat-top hex corners; corner `c` in [0,6) — same order as AXIAL_DIRS pairing */
/** Snap so adjacent hexes share identical corner coordinates (avoids hairline gaps & duplicate vertices). */
function snapXY(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x * 1_000_000) / 1_000_000,
    y: Math.round(y * 1_000_000) / 1_000_000,
  };
}

function hexCornersFlatTop(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let c = 0; c < 6; c++) {
    // Flat-top orientation uses 0, 60, 120... degrees.
    // Using -30° (pointy-top corners) with flat-top center spacing causes misalignment.
    const angleDeg = 60 * c;
    const rad = (Math.PI / 180) * angleDeg;
    corners.push(snapXY(cx + size * Math.cos(rad), cy + size * Math.sin(rad)));
  }
  return corners;
}

function vertexKey(x: number, y: number): string {
  const s = snapXY(x, y);
  return `${s.x},${s.y}`;
}

export interface BoardGraph {
  hexSize: number;
  hexes: HexLayoutCell[];
  vertices: VertexLayout[];
  edges: EdgeLayout[];
  /** axialKey -> hex index */
  axialToHexIndex: Map<string, number>;
  /** edge id -> layout */
  edgeById: Map<string, EdgeLayout>;
  /** vertex id -> adjacent vertex ids (via edges) */
  vertexNeighbors: Map<number, number[]>;
  /** sorted "a|b" -> edge id */
  edgeKeyToId: Map<string, string>;
}

export function buildBoardGraph(hexSize = 52): BoardGraph {
  const axialList = axialDisc(2);
  const axialToHexIndex = new Map<string, number>();
  axialList.forEach((h, i) => {
    axialToHexIndex.set(axialKey(h.q, h.r), i);
  });

  const vertexKeyToId = new Map<string, number>();
  const vertices: VertexLayout[] = [];

  function getVertexId(px: number, py: number): number {
    const snapped = snapXY(px, py);
    const k = vertexKey(snapped.x, snapped.y);
    let id = vertexKeyToId.get(k);
    if (id === undefined) {
      id = vertices.length;
      vertexKeyToId.set(k, id);
      vertices.push({ id, x: snapped.x, y: snapped.y, hexIndices: [] });
    }
    return id;
  }

  const hexes: HexLayoutCell[] = axialList.map((h, index) => {
    const { x: cx, y: cy } = axialToPixel(h.q, h.r, hexSize);
    const corners = hexCornersFlatTop(cx, cy, hexSize);
    const cornerVertexIds = corners.map((pt) => getVertexId(pt.x, pt.y));
    return { index, q: h.q, r: h.r, cx, cy, cornerVertexIds };
  });

  // Fill hexIndices per vertex
  for (const cell of hexes) {
    for (const vid of cell.cornerVertexIds) {
      const v = vertices[vid];
      if (!v.hexIndices.includes(cell.index)) {
        v.hexIndices.push(cell.index);
      }
    }
  }

  const edgeMap = new Map<string, EdgeLayout>();
  const edgeKeyToId = new Map<string, string>();

  function addEdge(a: number, b: number, hexIndex: number): void {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const ek = `${lo}|${hi}`;
    let eid = edgeKeyToId.get(ek);
    if (!eid) {
      eid = ek;
      edgeKeyToId.set(ek, eid);
      edgeMap.set(eid, { id: eid, a: lo, b: hi, hexIndices: [hexIndex] });
    } else {
      const e = edgeMap.get(eid)!;
      if (!e.hexIndices.includes(hexIndex)) {
        e.hexIndices.push(hexIndex);
      }
    }
  }

  for (const cell of hexes) {
    const cv = cell.cornerVertexIds;
    for (let i = 0; i < 6; i++) {
      addEdge(cv[i]!, cv[(i + 1) % 6]!, cell.index);
    }
  }

  const edges = [...edgeMap.values()];
  const edgeById = new Map(edges.map((e) => [e.id, e]));

  const vertexNeighbors = new Map<number, number[]>();
  for (const v of vertices) {
    vertexNeighbors.set(v.id, []);
  }
  for (const e of edges) {
    vertexNeighbors.get(e.a)!.push(e.b);
    vertexNeighbors.get(e.b)!.push(e.a);
  }

  return {
    hexSize,
    hexes,
    vertices,
    edges,
    axialToHexIndex,
    edgeById,
    vertexNeighbors,
    edgeKeyToId,
  };
}

/** Bounding box of all hex centers + corners (padding) for SVG viewBox */
export function boardViewBox(graph: BoardGraph, padding = 80): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const h of graph.hexes) {
    const corners = hexCornersFlatTop(h.cx, h.cy, graph.hexSize);
    for (const c of corners) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }
  }
  return `${minX - padding} ${minY - padding} ${maxX - minX + 2 * padding} ${maxY - minY + 2 * padding}`;
}

/** Flat-top hex path for SVG */
export function flatTopHexPath(cx: number, cy: number, size: number): string {
  const pts = hexCornersFlatTop(cx, cy, size);
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

function boardCentroid(graph: BoardGraph): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const h of graph.hexes) {
    sx += h.cx;
    sy += h.cy;
  }
  const n = graph.hexes.length;
  return { x: sx / n, y: sy / n };
}

/** Edges incident to `vertexId` with exactly one land hex — ocean-facing coastline. */
export function coastalIncidentEdges(graph: BoardGraph, vertexId: number): EdgeLayout[] {
  const out: EdgeLayout[] = [];
  for (const e of graph.edges) {
    if (e.a !== vertexId && e.b !== vertexId) continue;
    if (e.hexIndices.length === 1) out.push(e);
  }
  return out;
}

/**
 * All ocean-facing hex sides in cyclic order around the island (each edge has exactly one land hex).
 * Consecutive entries share one vertex — the boundary is a single closed walk.
 */
export function orderedCoastalEdges(graph: BoardGraph): EdgeLayout[] {
  const coastal = graph.edges.filter((e) => e.hexIndices.length === 1);
  if (coastal.length === 0) return [];

  const byVertex = new Map<number, EdgeLayout[]>();
  for (const v of graph.vertices) {
    byVertex.set(v.id, []);
  }
  for (const e of coastal) {
    byVertex.get(e.a)!.push(e);
    byVertex.get(e.b)!.push(e);
  }

  const start = coastal[0]!;
  const ordered: EdgeLayout[] = [start];
  let currEdge = start;
  let currVertex = start.b;

  for (;;) {
    const options = byVertex.get(currVertex)!.filter((e) => e.id !== currEdge.id);
    if (options.length !== 1) {
      throw new Error(
        `orderedCoastalEdges: expected 1 coastal continuation at vertex ${currVertex}, got ${options.length}`,
      );
    }
    const next = options[0]!;
    if (next.id === start.id) break;
    ordered.push(next);
    currVertex = next.a === currVertex ? next.b : next.a;
    currEdge = next;
  }

  if (ordered.length !== coastal.length) {
    throw new Error(
      `orderedCoastalEdges: closed walk length ${ordered.length} !== coastal edge count ${coastal.length}`,
    );
  }
  return ordered;
}

/**
 * Coastal edge to use for harbor art at a port vertex. If two coastal edges meet (two hexes at a
 * coast corner), picks the one whose midpoint is farther from the island centroid.
 */
export function pickPortCoastalEdge(graph: BoardGraph, vertexId: number): EdgeLayout | null {
  const coastal = coastalIncidentEdges(graph, vertexId);
  if (coastal.length === 0) return null;
  if (coastal.length === 1) return coastal[0]!;
  const c = boardCentroid(graph);
  let best = coastal[0]!;
  let bestD = -1;
  for (const e of coastal) {
    const va = graph.vertices[e.a];
    const vb = graph.vertices[e.b];
    const mx = (va.x + vb.x) / 2;
    const my = (va.y + vb.y) / 2;
    const dx = mx - c.x;
    const dy = my - c.y;
    const d = dx * dx + dy * dy;
    if (d > bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** The other endpoint of the dock edge for harbor art / port adjacency (paired with `portVertexId`). */
export function portDockPartnerVertex(graph: BoardGraph, portVertexId: number): number | null {
  const e = pickPortCoastalEdge(graph, portVertexId);
  if (!e) return null;
  return e.a === portVertexId ? e.b : e.a;
}

/** Gap from coastal edge midpoint into the ocean, scaled slightly with hex size. */
export function defaultPortDockGap(graph: BoardGraph): number {
  return graph.hexSize * 0.22 + 4;
}

/**
 * Point in the ocean for harbor/dock UI: edge midpoint, pushed outward from the sole land hex
 * center past the coastline.
 */
export function portDockAnchor(
  graph: BoardGraph,
  edge: EdgeLayout,
  gap: number,
): { x: number; y: number } {
  const hi = edge.hexIndices[0];
  if (hi === undefined) return { x: 0, y: 0 };
  const hex = graph.hexes[hi];
  const va = graph.vertices[edge.a];
  const vb = graph.vertices[edge.b];
  const mx = (va.x + vb.x) / 2;
  const my = (va.y + vb.y) / 2;
  const hx = hex.cx;
  const hy = hex.cy;
  let dx = mx - hx;
  let dy = my - hy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: mx, y: my };
  dx /= len;
  dy /= len;
  return { x: mx + dx * gap, y: my + dy * gap };
}

export const DEFAULT_BOARD_GRAPH = buildBoardGraph(52);
