import type { PlayerColor } from '../../networking/types';

export type PongInputDirection = -1 | 0 | 1;

export interface PongPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  lives: number;
  eliminated: boolean;
  /** 0–1 position along assigned zone arc (center of paddle). */
  paddleOffset: number;
}

export interface PongZone {
  playerId: string;
  /** Inclusive start of zone on normalized perimeter [0, 1). */
  startT: number;
  /** Exclusive end of zone on normalized perimeter [0, 1). */
  endT: number;
}

export interface PongBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PongState {
  players: PongPlayer[];
  zones: PongZone[];
  /** Player ids in perimeter order (fixed for the duration of a game). */
  zoneOrder: string[];
  /** Where the first zone starts on the normalized perimeter; fixed for the duration of a game. */
  zoneAnchorT: number;
  ball: PongBall;
  inputs: Record<string, PongInputDirection>;
  /** Fixed at 1 (square board); kept for backward compatibility with in-flight state. */
  boardAspect: number;
  /** Ticks before first serve only; 0 once the opening countdown finishes. */
  startCountdownTicks: number;
  /** Ticks to wait before launching the ball after a life loss (0 = in play). */
  serveHoldTicks: number;
  /** Ticks since last serve; drives gradual speed increase during a rally. */
  rallyTicks: number;
  /** Shown in the heads-up strip during serve hold after a missed save. */
  lifeLossAnnouncement: { playerId: string; eliminated: boolean } | null;
  /** Player whose paddle last reflected the ball; null before any paddle contact. */
  lastTouchPlayerId: string | null;
  gameOver: boolean;
  winners: string[];
  lastTickAt: number;
}

export type PongAction =
  | { type: 'set-input'; direction: PongInputDirection }
  | { type: 'tick'; dt: number };
