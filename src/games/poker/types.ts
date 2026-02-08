export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerPlayer {
  id: string;
  name: string;
  isBot: boolean;
  chips: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  betThisStreet: number;
  totalContrib: number; // total chips put in this hand (for side-pot calculation)
  leftGame: boolean;    // true if player left the session
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface WinnerInfo {
  playerId: string;
  amount: number;
  handName: string;
}

export interface PokerState {
  players: PokerPlayer[];
  dealerIndex: number;
  deck: Card[];
  communityCards: Card[];
  street: Street;
  pots: SidePot[];
  currentBet: number;
  minRaise: number;
  currentPlayerIndex: number;
  lastAggressorIndex: number;
  actedThisStreet: Record<string, boolean>;
  gameOver: boolean;
  winners: WinnerInfo[];
  smallBlind: number;
  bigBlind: number;
  showdownReveal: boolean; // true after showdown cards are revealed
  handNumber: number;      // which hand we're on (1-indexed)
  sessionOver: boolean;    // true when not enough players to continue
}

export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }
  | { type: 'next-hand' }
  | { type: 'leave-table' };
