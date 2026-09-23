import { gameStateMatchesRoom } from '../games/gameEngine';
import type { RoomState } from './types';

export function syncRoomAndGameState(
  nextRoom: RoomState,
  currentGameState: unknown,
): { room: RoomState; clearGameState: boolean } {
  if (nextRoom.phase === 'lobby' || !nextRoom.gameType) {
    return { room: nextRoom, clearGameState: true };
  }
  if (
    currentGameState != null
    && !gameStateMatchesRoom(nextRoom.gameType, currentGameState)
  ) {
    return { room: nextRoom, clearGameState: true };
  }
  return { room: nextRoom, clearGameState: false };
}

/** True when a client join/reconnect handshake has enough data to enter the game UI. */
export function isJoinSessionReady(room: RoomState, gameState: unknown): boolean {
  if (room.phase === 'lobby' || !room.gameType) {
    return true;
  }
  return gameState != null && gameStateMatchesRoom(room.gameType, gameState);
}
