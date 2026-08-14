import { describe, expect, it } from 'vitest';
import { FLY_DURATION_MS } from '../golf/golfAnimMetrics';
import {
  CENTER_HOLD_MS,
  CLEAR_HOLD_MS,
  OUTCOME_FLY_DURATION_MS,
  OUTCOME_STAGGER_MS,
  PLAY_STAGGER_MS,
  tensAnnouncementDelayMs,
} from './tensAnimMetrics';

const MAX_PLAY_CARDS = 4;
const MAX_CENTER_CARDS = 8;
const ANNOUNCEMENT_BUFFER_MS = 500;

const playFly = FLY_DURATION_MS + PLAY_STAGGER_MS * (MAX_PLAY_CARDS - 1);
const outcomeFly = OUTCOME_FLY_DURATION_MS + OUTCOME_STAGGER_MS * (MAX_CENTER_CARDS - 1);

describe('tensAnnouncementDelayMs', () => {
  it('uses fly-in + center hold only for normal plays', () => {
    expect(tensAnnouncementDelayMs('normal')).toBe(playFly + CENTER_HOLD_MS + ANNOUNCEMENT_BUFFER_MS);
  });

  it('includes outcome fly for pickup', () => {
    expect(tensAnnouncementDelayMs('pickup')).toBe(
      playFly + CENTER_HOLD_MS + outcomeFly + ANNOUNCEMENT_BUFFER_MS,
    );
  });

  it('uses clear hold and outcome fly for set-clear', () => {
    expect(tensAnnouncementDelayMs('set-clear')).toBe(
      playFly + CLEAR_HOLD_MS + outcomeFly + ANNOUNCEMENT_BUFFER_MS,
    );
  });

  it('uses clear hold and outcome fly for wild-clear', () => {
    expect(tensAnnouncementDelayMs('wild-clear')).toBe(
      playFly + CLEAR_HOLD_MS + outcomeFly + ANNOUNCEMENT_BUFFER_MS,
    );
  });

  it('defaults to normal when outcome is omitted', () => {
    expect(tensAnnouncementDelayMs()).toBe(tensAnnouncementDelayMs('normal'));
  });

  it('keeps normal delay shorter than clear/pickup delays', () => {
    const normal = tensAnnouncementDelayMs('normal');
    expect(normal).toBeLessThan(tensAnnouncementDelayMs('pickup'));
    expect(normal).toBeLessThan(tensAnnouncementDelayMs('set-clear'));
    expect(normal).toBeLessThan(tensAnnouncementDelayMs('wild-clear'));
  });

  it('preserves worst-case clear delay at ~4920ms', () => {
    expect(tensAnnouncementDelayMs('set-clear')).toBe(4920);
    expect(tensAnnouncementDelayMs('wild-clear')).toBe(4920);
  });
});
