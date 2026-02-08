export interface RevolverState {
  /** Total chambers in the revolver */
  chambers: number;
  /** Which chamber has the bullet (0-indexed) */
  bulletPosition: number;
  /** Current chamber about to fire (0-indexed) */
  currentChamber: number;
}

export interface LiarsDicePlayer {
  id: string;
  name: string;
  isBot: boolean;
  dice: number[];
  alive: boolean;
  revolver: RevolverState;
}

export interface Bid {
  quantity: number;
  faceValue: number; // 1-6
}

export type GamePhase =
  | 'rolling'
  | 'bidding'
  | 'revealing'
  | 'revolver'
  | 'gameOver';

export interface RoundResult {
  /** The type of challenge that ended the round */
  challengeType: 'liar' | 'spot-on';
  /** Who made the challenge */
  challengerId: string;
  /** Who made the bid being challenged */
  bidderId: string;
  /** The bid that was challenged */
  bid: Bid;
  /** The actual count of that face value across all dice */
  actualCount: number;
  /** Who lost the round and must pull the trigger */
  loserId: string;
  /** IDs of players who must pull trigger (for spot-on success, it's everyone except challenger) */
  triggerPlayerIds: string[];
  /** Track who has already pulled the trigger this round */
  pulledTrigger: Record<string, boolean>;
  /** Track revolver results: true = survived, false = eliminated */
  revolverResults: Record<string, 'survived' | 'eliminated'>;
}

export interface LiarsDiceState {
  players: LiarsDicePlayer[];
  /** Index into players array of the current bidder */
  currentPlayerIndex: number;
  /** Current highest bid on the table, null if no bid yet this round */
  currentBid: Bid | null;
  /** Player ID of the last person who made a bid */
  lastBidderId: string | null;
  phase: GamePhase;
  /** Result of the current round's challenge, null during bidding */
  roundResult: RoundResult | null;
  /** How many rounds have been played */
  round: number;
  /** The index of the player who starts the next round */
  roundStarterIndex: number;
}

export type LiarsDiceAction =
  | { type: 'roll' }
  | { type: 'make-bid'; bid: Bid }
  | { type: 'call-liar' }
  | { type: 'spot-on' }
  | { type: 'pull-trigger' }
  | { type: 'next-round' };
