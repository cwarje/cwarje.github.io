// Shared timing for the radial-seat deal animation. The board animation
// (useDealAnimation) and the host's turn scheduler (roomStore) both rely on
// these so gameplay only resumes once the dealing animation has finished.

export const DEAL_FLIGHT_DURATION_MS = 650;
export const DEAL_TOTAL_DEAL_MS = 3000;
export const DEAL_MIN_STEP_MS = 55;
export const DEAL_MAX_STEP_MS = 165;

/** Per-card stagger used when dealing `plannedCount` cards. */
export function dealStepMs(plannedCount: number): number {
  if (plannedCount <= 0) return DEAL_MIN_STEP_MS;
  return Math.max(DEAL_MIN_STEP_MS, Math.min(DEAL_MAX_STEP_MS, DEAL_TOTAL_DEAL_MS / plannedCount));
}

/** Total time (ms) for the whole deal animation of `plannedCount` cards. */
export function dealAnimationDurationMs(plannedCount: number): number {
  if (plannedCount <= 0) return 0;
  return Math.round((plannedCount - 1) * dealStepMs(plannedCount) + DEAL_FLIGHT_DURATION_MS);
}

/** Matches the post-flight cleanup tail in useDealAnimation. */
export const DEAL_ANIMATION_TAIL_MS = 120;

/** Slack for the board to mount and measure refs before the deal effect runs. */
export const DEAL_LAYOUT_GRACE_MS = 400;

/** How long the host should block turn scheduling after a deal begins animating. */
export function dealHoldDurationMs(plannedCount: number): number {
  if (plannedCount <= 0) return 0;
  return dealAnimationDurationMs(plannedCount) + DEAL_ANIMATION_TAIL_MS + DEAL_LAYOUT_GRACE_MS;
}

type DealHoldExtender = (untilMs: number) => void;

let dealHoldExtender: DealHoldExtender | null = null;

/** Host registers so client-side deal animations can extend the bot-scheduler hold. */
export function registerDealHoldExtender(extender: DealHoldExtender | null): void {
  dealHoldExtender = extender;
}

/** Called when a deal animation actually starts (after layout is ready). */
export function notifyDealAnimationStarted(plannedCount: number): void {
  if (!dealHoldExtender || plannedCount <= 0) return;
  dealHoldExtender(Date.now() + dealHoldDurationMs(plannedCount));
}
