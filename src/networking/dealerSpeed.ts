import type { DealerSpeed } from './types';

export const DEALER_SPEED_OPTIONS: { value: DealerSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'medium', label: 'Medium' },
  { value: 'fast', label: 'Fast' },
];

export const DEFAULT_DEALER_SPEED: DealerSpeed = 'medium';

export function isDealerSpeed(value: string | null): value is DealerSpeed {
  return !!value && DEALER_SPEED_OPTIONS.some((option) => option.value === value);
}

export function normalizeDealerSpeed(value: string | null): DealerSpeed {
  return isDealerSpeed(value) ? value : DEFAULT_DEALER_SPEED;
}

export function readStoredDealerSpeed(): DealerSpeed {
  return normalizeDealerSpeed(localStorage.getItem('dealerSpeed'));
}
