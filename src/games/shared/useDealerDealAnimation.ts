import { useRoomContext } from '../../networking/roomStore';
import { getDealTimingConfig } from './dealTiming';
import { useDealAnimation, type UseDealAnimationOptions } from './useDealAnimation';

type DealerDealAnimationOptions = Omit<
  UseDealAnimationOptions,
  'flightDurationMs' | 'totalDealMs' | 'minStepMs' | 'maxStepMs' | 'dealerSpeed'
>;

/** Reads dealer speed from room state and applies it to the shared deal animation. */
export function useDealerDealAnimation(options: DealerDealAnimationOptions) {
  const { room } = useRoomContext();
  const speed = room?.dealerSpeed ?? 'medium';
  const timing = getDealTimingConfig(speed);
  return useDealAnimation({ ...options, ...timing, dealerSpeed: speed });
}

export type { DealAnimationResult, DealSeat, DealExtraTarget, DealFlight, DealPoint } from './useDealAnimation';
