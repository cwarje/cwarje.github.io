export interface YahtzeePlayer {
  id: string;
  name: string;
  isBot: boolean;
  scorecard: Scorecard;
  totalScore: number;
}

export interface Scorecard {
  ones: number | null;
  twos: number | null;
  threes: number | null;
  fours: number | null;
  fives: number | null;
  sixes: number | null;
  threeOfAKind: number | null;
  fourOfAKind: number | null;
  fullHouse: number | null;
  smallStraight: number | null;
  largeStraight: number | null;
  yahtzee: number | null;
  chance: number | null;
}

export type ScoreCategory = keyof Scorecard;

export interface YahtzeeState {
  players: YahtzeePlayer[];
  currentPlayerIndex: number;
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  round: number;
  gameOver: boolean;
  yahtzeeBonus: Record<string, number>; // player id -> bonus count
}

export type YahtzeeAction =
  | { type: 'roll' }
  | { type: 'toggle-hold'; index: number }
  | { type: 'score'; category: ScoreCategory };
