export type GameType =
  | 'yahtzee'
  | 'farkle'
  | 'hearts'
  | 'poker'
  | 'up-and-down-the-river'
  | 'twelve'
  | 'settler'
  | 'cross-crib'
  | 'cribbage'
  | 'mobilization'
  | 'casino'
  | 'pong'
  | 'cucumber'
  | 'golf';
export type PlayerColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'indigo' | 'violet' | 'dark-purple';
export type HeartsTargetScore = 50 | 100;
export type FarkleTargetScore = 3000 | 5000 | 10000;
export type UpRiverStartMode = 'up-down' | 'down-up';
export type TwelvePileCount = 3 | 4 | 5 | 6;
export type CasinoMatchLength = 'to11' | 'to21' | 'eachDealerOnce';
export type CribbageTargetScore = 61 | 121;
export type CucumberEliminationThreshold = 30 | 50;
export type DealerSpeed = 'slow' | 'medium' | 'fast';
export interface GameStartOptions {
  targetScore?: HeartsTargetScore;
  farkleTargetScore?: FarkleTargetScore;
  upRiverStartMode?: UpRiverStartMode;
  pileCount?: TwelvePileCount;
  casinoMatchLength?: CasinoMatchLength;
  cribbageTargetScore?: CribbageTargetScore;
  cucumberEliminationThreshold?: CucumberEliminationThreshold;
  botCount?: number;
}

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface TableEvent {
  id: string;
  gameType: GameType;
  kind: string;
  fromPlayerId: string;
  toPlayerId?: string;
  payload?: unknown;
  createdAt: number;
}

export type TableEventInput = Omit<TableEvent, 'gameType' | 'fromPlayerId' | 'createdAt'>;

// Messages from client to host
export type ClientMessage =
  | { type: 'join'; playerName: string; playerColor: PlayerColor; deviceId: string }
  | { type: 'update-profile'; playerName: string; playerColor: PlayerColor; deviceId: string }
  | { type: 'action'; payload: unknown; deviceId: string }
  | { type: 'table-event'; event: TableEventInput; deviceId: string }
  | { type: 'leave' }
  | { type: 'ready' };

// Messages from host to client
export type HostMessage =
  | { type: 'room-state'; state: RoomState }
  | { type: 'game-state'; state: unknown }
  | { type: 'table-event'; event: TableEvent }
  | { type: 'error'; message: string }
  | { type: 'kicked'; reason: string }
  | { type: 'host-disconnected' };

export interface RoomState {
  roomCode: string;
  gameType: GameType | null;
  players: Player[];
  phase: 'lobby' | 'playing' | 'finished';
  hostId: string;
  wins: Record<string, number>;
  dealerSpeed: DealerSpeed;
}

export interface RoomContextValue {
  room: RoomState | null;
  gameState: unknown;
  isHost: boolean;
  myId: string;
  myPlayer: Player | null;
  createLobby: (playerName: string, playerColor: PlayerColor) => Promise<string>;
  joinRoom: (roomCode: string, playerName: string, playerColor: PlayerColor) => Promise<void>;
  updateProfile: (playerName: string, playerColor: PlayerColor) => void;
  rejoinRoom: (roomCode: string) => Promise<void>;
  leaveRoom: () => void;
  removePlayer: (playerId: string) => void;
  addBot: () => void;
  removeBot: (botId: string) => void;
  startGame: (gameType: GameType, options?: GameStartOptions) => void;
  sendAction: (payload: unknown) => void;
  sendTableEvent?: (event: TableEventInput) => void;
  lastTableEvent?: TableEvent | null;
  returnToLobby: () => void;
  endGame: () => void;
  setDealerSpeed: (speed: DealerSpeed) => void;
  error: string | null;
  clearError: () => void;
  connecting: boolean;
  reconnecting: boolean;
}
