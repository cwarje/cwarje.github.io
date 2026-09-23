export interface ElementSize {
  width: number;
  height: number;
}

export interface SeatRadii {
  seatRadiusX: number;
  seatRadiusY: number;
}

export const SEAT_EDGE_GAP_PX = 8;
export const SEAT_RADIUS_Y_SCALE = 1.0;

export const DEFAULT_PILE_SLOT_WIDTH_PX = 45;
export const DEFAULT_PILE_ROW_GAP_PX = 5;

/** Compact pile slots for 4-player tables (must match `.tens-board--players-4` / `.twelve-board--players-4` CSS). */
export const RADIAL_FOUR_PLAYER_PILE_WIDTH_PX = 38;
export const RADIAL_FOUR_PLAYER_PILE_ROW_GAP_PX = 4;

export function getPileRowHalfWidthPx(pilesPerPlayer: number, playerCount: number): number {
  if (pilesPerPlayer <= 0) return 0;
  const slotWidth =
    playerCount === 4 ? RADIAL_FOUR_PLAYER_PILE_WIDTH_PX : DEFAULT_PILE_SLOT_WIDTH_PX;
  const gap =
    playerCount === 4 ? RADIAL_FOUR_PLAYER_PILE_ROW_GAP_PX : DEFAULT_PILE_ROW_GAP_PX;
  return (pilesPerPlayer * slotWidth + (pilesPerPlayer - 1) * gap) / 2;
}

export interface ComputeRadialSeatRadiiInput {
  pilesPerPlayer: number;
  playerCount: number;
  tableSize: ElementSize;
  seatPillSize: ElementSize;
  fallbackRadii: SeatRadii;
}

export function computeRadialSeatRadii({
  pilesPerPlayer,
  playerCount,
  tableSize,
  seatPillSize,
  fallbackRadii,
}: ComputeRadialSeatRadiiInput): SeatRadii {
  const canUseMeasured =
    tableSize.width > 0 &&
    tableSize.height > 0 &&
    seatPillSize.width > 0 &&
    seatPillSize.height > 0;

  if (!canUseMeasured) {
    return fallbackRadii;
  }

  const pileRowHalf = getPileRowHalfWidthPx(pilesPerPlayer, playerCount);
  const pileOverflowHalf = Math.max(0, pileRowHalf - seatPillSize.width / 2);
  const usableHalfWidth =
    tableSize.width / 2 - seatPillSize.width / 2 - SEAT_EDGE_GAP_PX - pileOverflowHalf;
  const usableHalfHeight =
    tableSize.height / 2 - seatPillSize.height / 2 - SEAT_EDGE_GAP_PX;

  const measuredX = Math.max(0, Math.min(50, (usableHalfWidth / tableSize.width) * 100));
  const measuredY = Math.max(0, Math.min(50, (usableHalfHeight / tableSize.height) * 100));

  return {
    seatRadiusX: Math.min(fallbackRadii.seatRadiusX, measuredX),
    seatRadiusY: Math.min(fallbackRadii.seatRadiusY, measuredY),
  };
}
