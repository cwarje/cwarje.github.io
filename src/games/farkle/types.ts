import type { PlayerColor } from '../../networking/types';

export interface FarklePlayer {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  totalScore: number;
}

export type FarklePhase = 'roll' | 'choose' | 'roll-or-bank';

export interface FarkleState {
  players: FarklePlayer[];
  currentPlayerIndex: number;
  targetScore: number;
  dice: number[];
  kept: boolean[];
  turnScore: number;
  phase: FarklePhase;
  gameOver: boolean;
  lastEvent: string | null;
}

export type FarkleAction =
  | { type: 'roll' }
  | { type: 'keep'; indices: number[] }
  | { type: 'bank' };
