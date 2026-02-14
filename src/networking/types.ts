export type GameType = 'yahtzee' | 'hearts' | 'battleship' | 'liars-dice' | 'poker';

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
}

// Messages from client to host
export type ClientMessage =
  | { type: 'join'; playerName: string; deviceId: string }
  | { type: 'action'; payload: unknown }
  | { type: 'leave' }
  | { type: 'ready' };

// Messages from host to client
export type HostMessage =
  | { type: 'room-state'; state: RoomState }
  | { type: 'game-state'; state: unknown }
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
}

export interface RoomContextValue {
  room: RoomState | null;
  gameState: unknown;
  isHost: boolean;
  myId: string;
  myPlayer: Player | null;
  createLobby: (playerName: string) => Promise<string>;
  joinRoom: (roomCode: string, playerName: string) => Promise<void>;
  rejoinRoom: (roomCode: string) => Promise<void>;
  leaveRoom: () => void;
  removePlayer: (playerId: string) => void;
  addBot: () => void;
  removeBot: (botId: string) => void;
  startGame: (gameType: GameType) => void;
  sendAction: (payload: unknown) => void;
  returnToLobby: () => void;
  error: string | null;
  clearError: () => void;
  connecting: boolean;
  reconnecting: boolean;
}
