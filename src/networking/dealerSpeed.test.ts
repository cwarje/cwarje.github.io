import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DEALER_SPEED,
  normalizeDealerSpeed,
  readStoredDealerSpeed,
} from './dealerSpeed';

describe('dealerSpeed', () => {
  afterEach(() => {
    window.localStorage.removeItem('dealerSpeed');
  });

  it('normalizeDealerSpeed returns valid speeds unchanged', () => {
    expect(normalizeDealerSpeed('slow')).toBe('slow');
    expect(normalizeDealerSpeed('medium')).toBe('medium');
    expect(normalizeDealerSpeed('fast')).toBe('fast');
  });

  it('normalizeDealerSpeed defaults invalid or missing values to medium', () => {
    expect(normalizeDealerSpeed(null)).toBe(DEFAULT_DEALER_SPEED);
    expect(normalizeDealerSpeed('')).toBe(DEFAULT_DEALER_SPEED);
    expect(normalizeDealerSpeed('turbo')).toBe(DEFAULT_DEALER_SPEED);
  });

  it('readStoredDealerSpeed reads from localStorage', () => {
    window.localStorage.setItem('dealerSpeed', 'fast');
    expect(readStoredDealerSpeed()).toBe('fast');
  });

  it('readStoredDealerSpeed defaults when localStorage is empty', () => {
    expect(readStoredDealerSpeed()).toBe(DEFAULT_DEALER_SPEED);
  });
});
