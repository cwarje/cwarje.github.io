import type { RefObject } from 'react';
import {
  getElementMetrics,
  FLY_DURATION_MS,
  type ElementMetrics,
  type Point,
} from '../golf/golfAnimMetrics';

export { getElementMetrics, FLY_DURATION_MS, type ElementMetrics, type Point };

export const CAPTURE_STAGGER_MS = 40;
export const TABLE_GROUP_STAGGER_MS = 60;

export const FLY_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Matches default `.casino-tableCard` / slot / build pile (desktop). */
export const CASINO_TABLE_CARD_SIZE_FALLBACK = { width: 64, height: 92 };

export function resolveTableCardSize(
  boardRef: RefObject<HTMLDivElement | null>,
  tableSlotRefs: RefObject<Map<number, HTMLElement>>,
): { width: number; height: number } {
  const slots = tableSlotRefs.current;
  if (slots) {
    for (const el of slots.values()) {
      const metrics = getElementMetrics(boardRef, el);
      if (metrics && metrics.width > 0 && metrics.height > 0) {
        return { width: metrics.width, height: metrics.height };
      }
    }
  }
  return { ...CASINO_TABLE_CARD_SIZE_FALLBACK };
}
