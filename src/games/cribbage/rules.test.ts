import { describe, expect, it } from 'vitest';
import type { Card } from '../cross-crib/types';
import {
  scoreHandFlush,
  scoreCribFlush,
  scoreShowHand,
  scoreCribShow,
  scorePeggingPlay,
  peggingPlayScoreBreakdown,
  legalPeggingPlays,
} from './rules';
import type { PeggingPlay } from './types';

function c(suit: Card['suit'], rank: number): Card {
  return { suit, rank: rank as Card['rank'] };
}

describe('cribbage rules', () => {
  it('hand flush 4 only vs 5', () => {
    const hand = [c('hearts', 2), c('hearts', 3), c('hearts', 4), c('hearts', 5)];
    expect(scoreHandFlush(hand, c('clubs', 6))).toBe(4);
    expect(scoreHandFlush(hand, c('hearts', 7))).toBe(5);
  });

  it('crib flush only when all five match', () => {
    const crib = [c('spades', 2), c('spades', 3), c('spades', 4), c('spades', 5)];
    expect(scoreCribFlush(crib, c('spades', 6))).toBe(5);
    expect(scoreCribFlush(crib, c('hearts', 6))).toBe(0);
  });

  it('pegging pair without fifteen', () => {
    const before: PeggingPlay[] = [{ card: c('hearts', 5), playerIndex: 0 }];
    const { points } = scorePeggingPlay(before, { card: c('diamonds', 5), playerIndex: 1 });
    expect(points).toBe(2);
  });

  it('pegging run of three', () => {
    const before: PeggingPlay[] = [
      { card: c('hearts', 5), playerIndex: 0 },
      { card: c('clubs', 6), playerIndex: 1 },
    ];
    const { points } = scorePeggingPlay(before, { card: c('diamonds', 7), playerIndex: 0 });
    expect(points).toBe(3);
  });

  it('pegging breakdown: 31 plus pair', () => {
    const before: PeggingPlay[] = [
      { card: c('hearts', 10), playerIndex: 0 },
      { card: c('clubs', 10), playerIndex: 1 },
      { card: c('diamonds', 14), playerIndex: 0 },
      { card: c('spades', 5), playerIndex: 1 },
    ];
    const b = peggingPlayScoreBreakdown(before, { card: c('hearts', 5), playerIndex: 0 });
    expect(b.hit31).toBe(true);
    expect(b.points).toBe(4);
    expect(b.summaryParts).toEqual(['31 for 2', 'Pair for 2']);
  });

  it('pegging breakdown: 15 plus run of five', () => {
    const before: PeggingPlay[] = [
      { card: c('hearts', 14), playerIndex: 0 },
      { card: c('clubs', 2), playerIndex: 1 },
      { card: c('diamonds', 3), playerIndex: 0 },
      { card: c('spades', 4), playerIndex: 1 },
    ];
    const b = peggingPlayScoreBreakdown(before, { card: c('hearts', 5), playerIndex: 0 });
    expect(b.hit31).toBe(false);
    expect(b.points).toBe(7);
    expect(b.summaryParts).toEqual(['15 for 2', 'Run of 5 for 5']);
  });

  it('legal pegging respects 31 cap', () => {
    const hand = [c('hearts', 10), c('clubs', 5)];
    const seq: PeggingPlay[] = [{ card: c('diamonds', 10), playerIndex: 0 }];
    const legal = legalPeggingPlays(hand, seq, 22);
    expect(legal).toHaveLength(1);
    expect(legal[0].rank).toBe(5);
  });

  it('scoreShowHand counts fifteens', () => {
    const hand = [c('hearts', 5), c('diamonds', 5), c('clubs', 5), c('spades', 5)];
    const starter = c('hearts', 10);
    const pts = scoreShowHand(hand, starter);
    expect(pts).toBeGreaterThanOrEqual(8);
  });

  it('scoreCribShow matches five-card counting', () => {
    const crib = [c('hearts', 7), c('hearts', 8), c('hearts', 9), c('hearts', 10)];
    const starter = c('hearts', 2);
    expect(scoreCribShow(crib, starter)).toBe(scoreShowHand(crib, starter));
  });
});
