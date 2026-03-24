import { describe, expect, it } from 'vitest';
import type { Player } from '../../networking/types';
import {
  createCrossCribState,
  processCrossCribAction,
  getCribHandScore,
} from './logic';
import type { CrossCribState } from './types';

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    color: 'red',
    isBot: false,
    isHost: id === 'p0',
    connected: true,
  };
}

function confirmAllCribs(s: CrossCribState): CrossCribState {
  const need = s.players.length === 2 ? 2 : 1;
  let cur = s;
  for (const p of cur.players) {
    const pick = p.hand.slice(0, need);
    cur = processCrossCribAction(cur, { type: 'select-crib-discard', cards: pick }, p.id) as CrossCribState;
  }
  for (const p of cur.players) {
    cur = processCrossCribAction(cur, { type: 'confirm-crib-discard' }, p.id) as CrossCribState;
  }
  return cur;
}

function autoplayGridToFull(s: CrossCribState): CrossCribState {
  let cur = s;
  let guard = 0;
  while (cur.phase === 'playing' && guard++ < 30) {
    const p = cur.players[cur.currentPlayerIndex];
    const card = p.hand[0];
    let placed = false;
    outer: for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 2 && c === 2) continue;
        if (cur.grid[r][c]) continue;
        const next = processCrossCribAction(
          cur,
          { type: 'place-card', card, row: r, col: c },
          p.id
        ) as CrossCribState;
        if (next !== cur) {
          cur = next;
          placed = true;
          break outer;
        }
      }
    }
    if (!placed) throw new Error('autoplay stuck');
  }
  return cur;
}

describe('cross-crib logic', () => {
  it('after first crib confirm, removes cards from that hand and packs them left in confirmation order', () => {
    let s = createCrossCribState([makePlayer('p0', 'A'), makePlayer('p1', 'B')]) as CrossCribState;
    expect(s.cribCards).toEqual([null, null, null, null]);

    const firstIdx = (s.dealerIndex + 1) % 2;
    const otherIdx = 1 - firstIdx;
    const pick = s.players[firstIdx].hand.slice(0, 2);

    s = processCrossCribAction(s, { type: 'select-crib-discard', cards: pick }, s.players[firstIdx].id) as CrossCribState;
    s = processCrossCribAction(s, { type: 'confirm-crib-discard' }, s.players[firstIdx].id) as CrossCribState;

    expect(s.phase).toBe('crib-discard');
    expect(s.players[firstIdx].hand).toHaveLength(12);
    expect(s.players[otherIdx].hand).toHaveLength(14);
    expect(s.cribCards[0]).not.toBeNull();
    expect(s.cribCards[1]).not.toBeNull();
    expect(s.cribCards[2]).toBeNull();
    expect(s.cribCards[3]).toBeNull();
    expect(s.cribCards[0]).toEqual(pick[0]);
    expect(s.cribCards[1]).toEqual(pick[1]);
  });

  it('deals 14/7 cards and moves to playing after all crib confirmations', () => {
    let s = createCrossCribState([makePlayer('p0', 'A'), makePlayer('p1', 'B')]) as CrossCribState;
    expect(s.phase).toBe('crib-discard');
    expect(s.players[0].hand).toHaveLength(14);
    expect(s.players[1].hand).toHaveLength(14);

    s = confirmAllCribs(s);
    expect(s.phase).toBe('playing');
    expect(s.cribCards).toHaveLength(4);
    expect(s.players[0].hand).toHaveLength(12);
    expect(s.players[1].hand).toHaveLength(12);
  });

  it('four-player uses 7 cards and 1 to crib each', () => {
    const players = [
      makePlayer('p0', 'A'),
      makePlayer('p1', 'B'),
      makePlayer('p2', 'C'),
      makePlayer('p3', 'D'),
    ];
    let s = createCrossCribState(players) as CrossCribState;
    expect(s.players.every(p => p.hand.length === 7)).toBe(true);
    s = confirmAllCribs(s);
    expect(s.phase).toBe('playing');
    expect(s.players.every(p => p.hand.length === 6)).toBe(true);
  });

  it('fills grid then crib-reveal advances to round-end with crib score applied to dealer', () => {
    let s = createCrossCribState([makePlayer('p0', 'A'), makePlayer('p1', 'B')]) as CrossCribState;
    const dealerIdx = s.dealerIndex;
    s = confirmAllCribs(s);
    s = autoplayGridToFull(s);
    expect(s.phase).toBe('crib-reveal');
    expect(s.cribCards).toHaveLength(4);
    const cribPts = getCribHandScore(s);
    expect(cribPts).toBeGreaterThanOrEqual(0);

    const totalsBefore = s.players.map(p => p.totalScore);
    while (s.phase === 'crib-reveal') {
      s = processCrossCribAction(s, { type: 'advance-crib-reveal' }, '') as CrossCribState;
    }
    expect(s.phase).toBe('round-end');

    const rowTotal = s.rowScores.reduce((a, b) => a + b, 0);
    const colTotal = s.columnScores.reduce((a, b) => a + b, 0);
    expect(s.players[0].totalScore - totalsBefore[0]).toBe(dealerIdx === 0 ? rowTotal + cribPts : rowTotal);
    expect(s.players[1].totalScore - totalsBefore[1]).toBe(dealerIdx === 1 ? colTotal + cribPts : colTotal);
    expect(s.roundSummary).toContain('Crib');
  });
});
