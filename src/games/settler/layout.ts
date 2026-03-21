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

export const DEFAULT_BOARD_GRAPH = buildBoardGraph(52);
