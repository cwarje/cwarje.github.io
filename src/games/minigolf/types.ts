import type { PlayerColor } from '../../networking/types';

export interface MinigolfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MinigolfVec {
  x: number;
  y: number;
}

export interface MinigolfCourse {
  /** Axis-aligned wall rectangles, including the four border walls. */
  walls: MinigolfRect[];
  tee: MinigolfVec;
  cup: MinigolfVec;
  par: number;
}

export interface MinigolfBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface MinigolfPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  ball: MinigolfBall;
  /** Strokes taken on the current hole. */
  strokes: number;
  holed: boolean;
  gaveUp: boolean;
  /** Recorded score per completed hole (index = hole index). */
  scores: number[];
  /** Host-side bot pacing: ticks until the bot strokes; -1 = not scheduled. */
  botNextStrokeTick: number;
}

export type MinigolfPhase = 'playing' | 'summary' | 'game-over';

export interface MinigolfState {
  players: MinigolfPlayer[];
  /** All holes are generated up front so every client renders identical courses. */
  courses: MinigolfCourse[];
  holeIndex: number;
  phase: MinigolfPhase;
  /** Ticks remaining on the between-holes scorecard overlay. */
  summaryTicks: number;
  gameOver: boolean;
  winners: string[];
  lastTickAt: number;
}

export type MinigolfAction =
  | { type: 'stroke'; angle: number; power: number }
  | { type: 'next-hole' }
  | { type: 'tick'; dt: number };
