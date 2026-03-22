import type { Player } from '../../networking/types';
import { DEFAULT_BOARD_GRAPH, orderedCoastalEdges } from './layout';
import { createSettlerState } from './logic';
import {
  STANDARD_HARBOR_DECK,
  harborKindAtVertex,
  portsFromState,
  randomPortKindsByCoastalEdgeId,
} from './ports';
import type { Resource } from './types';

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

/** Deterministic PRNG in (0,1) for tests. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0x10000000;
  };
}

describe('settler random ports', () => {
  const graph = DEFAULT_BOARD_GRAPH;

  it('assigns exactly nine coastal edges with two hex sides between any two on the cycle', () => {
    const ordered = orderedCoastalEdges(graph);
    const L = ordered.length;
    const indexById = new Map(ordered.map((e, i) => [e.id, i]));
    for (let seed = 1; seed <= 80; seed++) {
      const ports = randomPortKindsByCoastalEdgeId(graph, makeRng(seed));
      const ids = Object.keys(ports);
      expect(ids).toHaveLength(9);
      const idx = ids.map((id) => indexById.get(id)).sort((a, b) => a! - b!);
      expect(idx.every((n) => n !== undefined)).toBe(true);
      const sorted = idx as number[];
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]!;
        const b = sorted[(i + 1) % sorted.length]!;
        const gap = i < sorted.length - 1 ? b - a : b + L - a;
        expect(gap, `seed ${seed} gap between adjacent port indices`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('matches standard harbor deck multiset', () => {
    const ports = randomPortKindsByCoastalEdgeId(graph, makeRng(42));
    const serial = (k: (typeof STANDARD_HARBOR_DECK)[number]) =>
      k.kind === 'generic-3' ? 'g' : k.resource;
    const got = Object.values(ports).map(serial).sort().join(',');
    const exp = [...STANDARD_HARBOR_DECK].map(serial).sort().join(',');
    expect(got).toBe(exp);
  });

  it('resolves harbor at both endpoints of each port edge', () => {
    const s = createSettlerState(makePlayers(3), makeRng(99));
    const ports = portsFromState(s);
    for (const eid of Object.keys(ports)) {
      const e = graph.edgeById.get(eid)!;
      const k = ports[eid];
      expect(harborKindAtVertex(e.a, graph, ports)).toEqual(k);
      expect(harborKindAtVertex(e.b, graph, ports)).toEqual(k);
    }
  });

  it('includes one 2:1 special per resource', () => {
    const ports = randomPortKindsByCoastalEdgeId(graph, makeRng(7));
    const specials = Object.values(ports).filter((k) => k.kind === 'special-2') as {
      kind: 'special-2';
      resource: Resource;
    }[];
    expect(specials).toHaveLength(5);
    const rs = new Set(specials.map((x) => x.resource));
    expect(rs.size).toBe(5);
  });
});
