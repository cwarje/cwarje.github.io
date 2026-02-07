export type CellState = 'empty' | 'ship' | 'hit' | 'miss';

export interface Ship {
  name: string;
  size: number;
  cells: [number, number][]; // [row, col]
  sunk: boolean;
}

export interface BattleshipPlayer {
  id: string;
  name: string;
  isBot: boolean;
  board: CellState[][]; // 10x10
  ships: Ship[];
  shots: CellState[][]; // 10x10 tracking board (what I've shot at opponent)
  ready: boolean;
}

export interface BattleshipState {
  players: BattleshipPlayer[];
  phase: 'placement' | 'playing' | 'finished';
  currentPlayerIndex: number;
  winner: string | null;
  lastShot: { row: number; col: number; result: 'hit' | 'miss' | 'sunk' } | null;
}

export const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

export type BattleshipAction =
  | { type: 'place-ships'; ships: Ship[] }
  | { type: 'fire'; row: number; col: number };
