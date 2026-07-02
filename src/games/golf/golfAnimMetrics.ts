import type { RefObject } from 'react';

export interface Point {
  x: number;
  y: number;
}

export interface ElementMetrics {
  center: Point;
  width: number;
  height: number;
}

export function getElementMetrics(
  boardRef: RefObject<HTMLElement | null>,
  elementRef: RefObject<HTMLElement | null> | HTMLElement | null | undefined,
): ElementMetrics | null {
  const boardRect = boardRef.current?.getBoundingClientRect();
  const element = elementRef && 'current' in elementRef ? elementRef.current : elementRef;
  const elementRect = element?.getBoundingClientRect();
  if (!boardRect || !elementRect || elementRect.width === 0) return null;
  return {
    center: {
      x: elementRect.left + elementRect.width / 2 - boardRect.left,
      y: elementRect.top + elementRect.height / 2 - boardRect.top,
    },
    width: elementRect.width,
    height: elementRect.height,
  };
}

export const FLIP_DURATION_MS = 420;
export const FLIP_TO_FLY_PAUSE_MS = 400;
export const FLY_DURATION_MS = 450;
