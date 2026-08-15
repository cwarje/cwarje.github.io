import {
  getElementMetrics,
  FLY_DURATION_MS,
  type ElementMetrics,
  type Point,
} from '../golf/golfAnimMetrics';
import type { TensPlayOutcome } from './types';

export { getElementMetrics, FLY_DURATION_MS, type ElementMetrics, type Point };

export const PLAY_STAGGER_MS = 80;
export const OUTCOME_STAGGER_MS = 40;
export const OUTCOME_FLY_DURATION_MS = 450;
/** Time played cards stay visible on the center pile before pickup. */
export const CENTER_HOLD_MS = 2000;
/** Extra time to show clear HUD before center cards fly to the discard pile. */
export const CLEAR_HOLD_MS = 3000;
/** Total announcement duration for normal (pass-turn) plays — HUD + fly-in. */
export const NORMAL_ANNOUNCEMENT_MS = 2000;

const MAX_PLAY_CARDS = 4;
const MAX_CENTER_CARDS = 8;
const ANNOUNCEMENT_BUFFER_MS = 500;

/** Pixel offset per card in the visible center stack (matches TensBoard center card transform). */
export const CENTER_STACK_STEP_X = 5;
export const CENTER_STACK_STEP_Y = 4;
export const CENTER_STACK_VISIBLE_COUNT = 8;

export function centerStackDisplayIndex(fullPileLength: number, stackIndex: number): number {
  return stackIndex - Math.max(0, fullPileLength - CENTER_STACK_VISIBLE_COUNT);
}

export function centerStackOffset(displayIndex: number): Point {
  return {
    x: displayIndex * CENTER_STACK_STEP_X,
    y: -displayIndex * CENTER_STACK_STEP_Y,
  };
}

export function playFlyMs(playCount: number): number {
  const count = Math.max(1, Math.min(playCount, MAX_PLAY_CARDS));
  return FLY_DURATION_MS + PLAY_STAGGER_MS * (count - 1);
}

/** Center hold after fly-in for normal plays — keeps client animation aligned with host timer. */
export function normalCenterHoldMs(playCount: number): number {
  return Math.max(0, NORMAL_ANNOUNCEMENT_MS - playFlyMs(playCount));
}

/** Host announcement duration — covers fly-in, center hold, and fly-out. */
export function tensAnnouncementDelayMs(outcome: TensPlayOutcome = 'normal'): number {
  if (outcome === 'normal') {
    return NORMAL_ANNOUNCEMENT_MS;
  }
  const playFly = FLY_DURATION_MS + PLAY_STAGGER_MS * (MAX_PLAY_CARDS - 1);
  const outcomeFly = OUTCOME_FLY_DURATION_MS + OUTCOME_STAGGER_MS * (MAX_CENTER_CARDS - 1);
  const holdMs = outcome === 'pickup' ? CENTER_HOLD_MS : CLEAR_HOLD_MS;
  return playFly + holdMs + outcomeFly + ANNOUNCEMENT_BUFFER_MS;
}
