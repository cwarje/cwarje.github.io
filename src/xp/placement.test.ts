import { describe, expect, it } from 'vitest';
import { buildPlacementTiers, computeTieredPlacementAwards } from './placement';

const WEEKDAY = new Date('2026-07-06T12:00:00Z');
const SATURDAY = new Date('2026-07-04T12:00:00Z');

describe('placement xp', () => {
  it('builds tiers with ties', () => {
    const tiers = buildPlacementTiers(
      [
        { id: 'a', score: 10 },
        { id: 'b', score: 12 },
        { id: 'c', score: 12 },
      ],
      'asc',
    );
    expect(tiers).toEqual([['a'], ['b', 'c']]);
  });

  it('awards 20/10 for first and second when single first place', () => {
    const tiers = [['a'], ['b'], ['c']];
    const awards = computeTieredPlacementAwards(tiers, { first: 20, second: 10 }, { at: WEEKDAY });
    expect(awards.get('a')).toBe(20);
    expect(awards.get('b')).toBe(10);
    expect(awards.get('c')).toBeUndefined();
  });

  it('awards both first-place tiers when tied for first', () => {
    const tiers = [['a', 'b'], ['c']];
    const awards = computeTieredPlacementAwards(tiers, { first: 20, second: 10 }, { at: WEEKDAY });
    expect(awards.get('a')).toBe(20);
    expect(awards.get('b')).toBe(20);
    expect(awards.get('c')).toBeUndefined();
  });

  it('doubles on UTC weekends', () => {
    const tiers = [['a'], ['b']];
    const awards = computeTieredPlacementAwards(tiers, { first: 20, second: 10 }, { at: SATURDAY });
    expect(awards.get('a')).toBe(40);
    expect(awards.get('b')).toBe(20);
  });
});
