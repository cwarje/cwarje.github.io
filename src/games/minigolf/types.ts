import type { PlayerColor } from '../../networking/types';
import type {
  MinigolfCourseTheme,
  MinigolfDevThemeOption,
  MinigolfThemeOption,
  ObstacleMotionKind,
} from './themes';

export type { MinigolfCourseTheme, MinigolfDevThemeOption, MinigolfThemeOption, ObstacleMotionKind };

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

export interface MinigolfLandmine {
  x: number;
  y: number;
  emoji: string;
  motion?: ObstacleMotionKind;
}

/** Live patrol position for the current hole; index matches course.landmines. */
export interface MinigolfLandmineMotion {
  x: number;
  y: number;
  /** horizontal: true = moving right; vertical: true = moving down */
  facingPositive: boolean;
}

export interface MinigolfCourse {
  /** Axis-aligned wall rectangles, including the four border walls. */
  walls: MinigolfRect[];
  /** Sink/lava hazards or frozen ice patches (same rects, theme-dependent behavior). */
  waterHazards: MinigolfRect[];
  /** Sand/mud slow zones — ball slows heavily but does not sink. */
  sandTraps?: MinigolfRect[];
  /** Proximity obstacles that detonate and knock nearby balls away. */
  landmines?: MinigolfLandmine[];
  tee: MinigolfVec;
  cup: MinigolfVec;
  par: number;
  /** Resolved visual/physics theme for this hole. */
  theme: MinigolfCourseTheme;
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
  /** Ticks remaining in the water-sink animation; 0 = normal play. */
  sinkTicks: number;
  /** True while sinkTicks counts down after cup capture (not a water penalty). */
  holeSinkPending: boolean;
  /** Ball position when cup capture started; used for the roll-in animation. */
  holeCapturePos?: MinigolfVec;
  /** Ball position at the start of the most recent stroke; water penalty drop point. */
  lastStrokePos: MinigolfVec;
  /** Synced lobby XP snapshot for HUD level display. */
  minigolfXp?: number;
}

export type MinigolfPhase = 'playing' | 'summary' | 'game-over';

export interface MinigolfState {
  players: MinigolfPlayer[];
  /** When true, active balls bounce off each other; when false, they pass through. */
  ballCollisions: boolean;
  /** When true, proximity obstacles are placed on each hole. */
  obstacles: boolean;
  /** Indices of detonated landmines on the current hole. */
  triggeredLandmines: number[];
  /** Patrol positions for emoji obstacles on the current hole. */
  landmineMotion?: MinigolfLandmineMotion[];
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
  | { type: 'tick'; dt: number }
  | { type: 'dev-regenerate-hole'; devTheme: MinigolfDevThemeOption };
