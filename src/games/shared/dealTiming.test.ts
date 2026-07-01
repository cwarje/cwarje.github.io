import { describe, expect, it } from 'vitest';
import {
  DEAL_FLIGHT_DURATION_MS,
  DEAL_MAX_STEP_MS,
  DEAL_MIN_STEP_MS,
  DEAL_TOTAL_DEAL_MS,
  dealAnimationDurationMs,
  dealHoldDurationMs,
  getDealTimingConfig,
} from './dealTiming';

describe('dealTiming', () => {
  it('medium speed matches baseline constants', () => {
    const config = getDealTimingConfig('medium');
    expect(config).toEqual({
      flightDurationMs: DEAL_FLIGHT_DURATION_MS,
      totalDealMs: DEAL_TOTAL_DEAL_MS,
      minStepMs: DEAL_MIN_STEP_MS,
      maxStepMs: DEAL_MAX_STEP_MS,
    });
  });

  it('slow is slower than medium and fast is faster for representative card counts', () => {
    for (const cardCount of [4, 13, 52]) {
      const slow = dealAnimationDurationMs(cardCount, 'slow');
      const medium = dealAnimationDurationMs(cardCount, 'medium');
      const fast = dealAnimationDurationMs(cardCount, 'fast');
      expect(slow).toBeGreaterThan(medium);
      expect(medium).toBeGreaterThan(fast);
    }
  });

  it('dealHoldDurationMs scales consistently with animation duration', () => {
    const cardCount = 13;
    const slowHold = dealHoldDurationMs(cardCount, 'slow');
    const mediumHold = dealHoldDurationMs(cardCount, 'medium');
    const fastHold = dealHoldDurationMs(cardCount, 'fast');
    expect(slowHold).toBeGreaterThan(mediumHold);
    expect(mediumHold).toBeGreaterThan(fastHold);
    expect(slowHold - mediumHold).toBe(dealAnimationDurationMs(cardCount, 'slow') - dealAnimationDurationMs(cardCount, 'medium'));
  });
});
