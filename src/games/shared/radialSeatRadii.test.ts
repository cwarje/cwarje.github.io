import { describe, expect, it } from 'vitest';
import { computeRadialSeatRadii } from './radialSeatRadii';

const tableWide = { width: 900, height: 500 };
const pill = { width: 132, height: 48 };

describe('computeRadialSeatRadii', () => {
  const fallback4 = { seatRadiusX: 36, seatRadiusY: 29 };

  it('uses fallback when table is not measured', () => {
    expect(
      computeRadialSeatRadii({
        pilesPerPlayer: 4,
        playerCount: 4,
        tableSize: { width: 0, height: 0 },
        seatPillSize: pill,
        fallbackRadii: fallback4,
      }),
    ).toEqual(fallback4);
  });

  it('caps horizontal radius at fallback on wide tables', () => {
    const radii = computeRadialSeatRadii({
      pilesPerPlayer: 4,
      playerCount: 4,
      tableSize: tableWide,
      seatPillSize: pill,
      fallbackRadii: fallback4,
    });
    expect(radii.seatRadiusX).toBeLessThanOrEqual(fallback4.seatRadiusX);
    expect(radii.seatRadiusX).toBeGreaterThan(34);
  });

  it('shrinks horizontal radius on narrow tables', () => {
    const radii = computeRadialSeatRadii({
      pilesPerPlayer: 4,
      playerCount: 4,
      tableSize: { width: 320, height: 400 },
      seatPillSize: pill,
      fallbackRadii: fallback4,
    });
    expect(radii.seatRadiusX).toBeLessThan(fallback4.seatRadiusX);
  });

  it('uses the same cap logic for six players', () => {
    const fallback6 = { seatRadiusX: 42, seatRadiusY: 35 };
    const radii = computeRadialSeatRadii({
      pilesPerPlayer: 4,
      playerCount: 6,
      tableSize: tableWide,
      seatPillSize: pill,
      fallbackRadii: fallback6,
    });
    expect(radii.seatRadiusX).toBeLessThanOrEqual(fallback6.seatRadiusX);
    expect(radii.seatRadiusX).toBeGreaterThan(36);
  });

  it('accounts for wider pile rows in Twelve six-pile mode', () => {
    const fallback4SixPiles = { seatRadiusX: 36, seatRadiusY: 29 };
    const fourPiles = computeRadialSeatRadii({
      pilesPerPlayer: 4,
      playerCount: 4,
      tableSize: tableWide,
      seatPillSize: pill,
      fallbackRadii: fallback4SixPiles,
    });
    const sixPiles = computeRadialSeatRadii({
      pilesPerPlayer: 6,
      playerCount: 4,
      tableSize: tableWide,
      seatPillSize: pill,
      fallbackRadii: fallback4SixPiles,
    });
    expect(sixPiles.seatRadiusX).toBeLessThan(fourPiles.seatRadiusX);
  });

  it('ignores pile width when pile count is zero', () => {
    const looseFallback = { seatRadiusX: 50, seatRadiusY: 50 };
    const withPiles = computeRadialSeatRadii({
      pilesPerPlayer: 4,
      playerCount: 3,
      tableSize: tableWide,
      seatPillSize: pill,
      fallbackRadii: looseFallback,
    });
    const noPiles = computeRadialSeatRadii({
      pilesPerPlayer: 0,
      playerCount: 3,
      tableSize: tableWide,
      seatPillSize: pill,
      fallbackRadii: looseFallback,
    });
    expect(noPiles.seatRadiusX).toBeGreaterThan(withPiles.seatRadiusX);
  });
});
