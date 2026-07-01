// Shared timing for the radial-seat deal animation. The board animation
// (useDealAnimation) and the host's turn scheduler (roomStore) both rely on
// these so gameplay only resumes once the dealing animation has finished.

import type { DealerSpeed } from '../../networking/types';

export const DEAL_FLIGHT_DURATION_MS = 650;
export const DEAL_TOTAL_DEAL_MS = 3000;
export const DEAL_MIN_STEP_MS = 55;
export const DEAL_MAX_STEP_MS = 165;

const DEAL_SPEED_MULTIPLIERS: Record<DealerSpeed, number> = {
  slow: 4,
  medium: 1,
  fast: 0.6,
};

export interface DealTimingConfig {
  flightDurationMs: number;
  totalDealMs: number;
  minStepMs: number;
  maxStepMs: number;
}

/** Timing constants scaled for the given dealer speed (Medium = current defaults). */
export function getDealTimingConfig(speed: DealerSpeed = 'medium'): DealTimingConfig {
  const m = DEAL_SPEED_MULTIPLIERS[speed];
  return {
    flightDurationMs: Math.round(DEAL_FLIGHT_DURATION_MS * m),
    totalDealMs: Math.round(DEAL_TOTAL_DEAL_MS * m),
    minStepMs: Math.round(DEAL_MIN_STEP_MS * m),
    maxStepMs: Math.round(DEAL_MAX_STEP_MS * m),
  };
}

/** Per-card stagger used when dealing `plannedCount` cards. */
export function dealStepMs(plannedCount: number, speed: DealerSpeed = 'medium'): number {
  const { totalDealMs, minStepMs, maxStepMs } = getDealTimingConfig(speed);
  if (plannedCount <= 0) return minStepMs;
  return Math.max(minStepMs, Math.min(maxStepMs, totalDealMs / plannedCount));
}

/** Total time (ms) for the whole deal animation of `plannedCount` cards. */
export function dealAnimationDurationMs(plannedCount: number, speed: DealerSpeed = 'medium'): number {
  if (plannedCount <= 0) return 0;
  const { flightDurationMs } = getDealTimingConfig(speed);
  return Math.round((plannedCount - 1) * dealStepMs(plannedCount, speed) + flightDurationMs);
}

/** Matches the post-flight cleanup tail in useDealAnimation. */
export const DEAL_ANIMATION_TAIL_MS = 120;

/** Slack for the board to mount and measure refs before the deal effect runs. */
export const DEAL_LAYOUT_GRACE_MS = 400;

/** How long the host should block turn scheduling after a deal begins animating. */
export function dealHoldDurationMs(plannedCount: number, speed: DealerSpeed = 'medium'): number {
  if (plannedCount <= 0) return 0;
  return dealAnimationDurationMs(plannedCount, speed) + DEAL_ANIMATION_TAIL_MS + DEAL_LAYOUT_GRACE_MS;
}

type DealHoldExtender = (untilMs: number) => void;

let dealHoldExtender: DealHoldExtender | null = null;

/** Host registers so client-side deal animations can extend the bot-scheduler hold. */
export function registerDealHoldExtender(extender: DealHoldExtender | null): void {
  dealHoldExtender = extender;
}

/** Called when a deal animation actually starts (after layout is ready). */
export function notifyDealAnimationStarted(plannedCount: number, speed: DealerSpeed = 'medium'): void {
  if (!dealHoldExtender || plannedCount <= 0) return;
  dealHoldExtender(Date.now() + dealHoldDurationMs(plannedCount, speed));
}
