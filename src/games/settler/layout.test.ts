import { createSettlerState } from './logic';
import type { Player } from '../../networking/types';
import {
  DEFAULT_BOARD_GRAPH,
  defaultPortDockGap,
  orderedCoastalEdges,
  portDockAnchor,
} from './layout';
import { harborKindAtVertex, portsFromState } from './ports';

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

describe('settler layout — ordered coastal cycle', () => {
  const graph = DEFAULT_BOARD_GRAPH;

  it('forms one Hamiltonian cycle through all single-hex edges', () => {
    const coastal = graph.edges.filter((e) => e.hexIndices.length === 1);
    const ordered = orderedCoastalEdges(graph);
    expect(ordered).toHaveLength(coastal.length);
    const ids = new Set(ordered.map((e) => e.id));
    expect(ids.size).toBe(coastal.length);
    for (let i = 0; i < ordered.length; i++) {
      const e = ordered[i]!;
      const f = ordered[(i + 1) % ordered.length]!;
      const share =
        e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b;
      expect(share, `edges ${e.id} and ${f.id} should share a vertex`).toBe(true);
    }
  });
});

describe('settler layout — port dock geometry', () => {
  const graph = DEFAULT_BOARD_GRAPH;
  const ports = portsFromState(createSettlerState(makePlayers(3), () => 0.42));

  it('finds a single-hex coastal edge for every port', () => {
    for (const eid of Object.keys(ports)) {
      const edge = graph.edgeById.get(eid);
      expect(edge, `port edge ${eid}`).toBeDefined();
      expect(edge!.hexIndices).toHaveLength(1);
    }
  });

  it('places dock anchor outward from land past the coastal edge midpoint', () => {
    const gap = defaultPortDockGap(graph);
    for (const eid of Object.keys(ports)) {
      const edge = graph.edgeById.get(eid)!;
      const hi = edge.hexIndices[0]!;
      const hex = graph.hexes[hi]!;
      const va = graph.vertices[edge.a]!;
      const vb = graph.vertices[edge.b]!;
      const mx = (va.x + vb.x) / 2;
      const my = (va.y + vb.y) / 2;
      const anchor = portDockAnchor(graph, edge, gap);
      const dMid = Math.hypot(mx - hex.cx, my - hex.cy);
      const dAnchor = Math.hypot(anchor.x - hex.cx, anchor.y - hex.cy);
      expect(dAnchor, `edge ${eid}`).toBeGreaterThan(dMid);
      expect(Math.hypot(anchor.x - mx, anchor.y - my)).toBeCloseTo(gap, 5);
    }
  });

  it('both endpoints of each port edge resolve to the same harbor kind', () => {
    for (const eid of Object.keys(ports)) {
      const edge = graph.edgeById.get(eid)!;
      const kind = ports[eid];
      expect(harborKindAtVertex(edge.a, graph, ports)).toEqual(kind);
      expect(harborKindAtVertex(edge.b, graph, ports)).toEqual(kind);
    }
  });
});
