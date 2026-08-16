import type { PlayerColor } from '../../networking/types';

/** 0 = point 1 … 23 = point 24 */
export type PointIndex = number;

export type Side = 'white' | 'black';

export type MoveFrom = PointIndex | 'bar';

export type MoveTo = PointIndex | 'off';

export interface BackgammonPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  side: Side;
}

export type Phase = 'pre-roll' | 'moving' | 'finished';

export interface LastMove {
  from: MoveFrom;
  to: MoveTo;
  dieUsed: number;
  hit?: boolean;
  side: Side;
}

export interface BackgammonState {
  players: [BackgammonPlayer, BackgammonPlayer];
  currentPlayerIndex: 0 | 1;
  phase: Phase;
  /** Signed counts per point: positive = white, negative = black */
  points: number[];
  bar: { white: number; black: number };
  off: { white: number; black: number };
  dice: [number, number] | null;
  /** Remaining die pips to consume this turn (doubles → 4 entries) */
  movesRemaining: number[];
  winnerIds: string[] | null;
  lastMove?: LastMove;
}

export type BackgammonAction =
  | { type: 'roll' }
  | { type: 'move'; from: MoveFrom; to: MoveTo }
  | { type: 'end-turn' };

export interface LegalMove {
  from: MoveFrom;
  to: MoveTo;
  dieUsed: number;
  hit?: boolean;
}

export const POINT_COUNT = 24;
export const CHECKERS_PER_PLAYER = 15;

/** Standard opening layout (signed point counts). */
export function createStartingPoints(): number[] {
  const points = Array(POINT_COUNT).fill(0);
  points[23] = 2; // white on 24
  points[12] = 5; // white on 13
  points[7] = 3; // white on 8
  points[5] = 5; // white on 6
  points[0] = -2; // black on 1
  points[11] = -5; // black on 12
  points[16] = -3; // black on 17
  points[18] = -5; // black on 19
  return points;
}

export function sideForPlayerIndex(index: 0 | 1): Side {
  return index === 0 ? 'white' : 'black';
}

export function playerIndexForSide(state: BackgammonState, side: Side): 0 | 1 {
  return state.players[side === 'white' ? 0 : 1].side === side
    ? side === 'white'
      ? 0
      : 1
    : side === 'white'
      ? 1
      : 0;
}

export function currentSide(state: BackgammonState): Side {
  return state.players[state.currentPlayerIndex].side;
}
