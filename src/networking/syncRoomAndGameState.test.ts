import { createInitialGameState } from '../games/gameEngine';
import { createMinigolfState } from '../games/minigolf/logic';
import type { Player, RoomState } from './types';
import { isJoinSessionReady, syncRoomAndGameState } from './syncRoomAndGameState';

const hostPlayer: Player = {
  id: 'host-1',
  name: 'Host',
  color: 'blue',
  isBot: false,
  isHost: true,
  connected: true,
};

function createRoomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: 'ABCD',
    gameType: 'hearts',
    players: [hostPlayer],
    phase: 'playing',
    hostId: 'host-1',
    wins: {},
    dealerSpeed: 'medium',
    ...overrides,
  };
}

describe('syncRoomAndGameState', () => {
  it('clears game state when room is in lobby', () => {
    const room = createRoomState({ phase: 'lobby', gameType: null });
    const result = syncRoomAndGameState(room, createInitialGameState('hearts', [hostPlayer]));
    expect(result.room).toEqual(room);
    expect(result.clearGameState).toBe(true);
  });

  it('clears game state when room has no game type', () => {
    const room = createRoomState({ gameType: null });
    const result = syncRoomAndGameState(room, null);
    expect(result.clearGameState).toBe(true);
  });

  it('clears game state when stored state is from a different game', () => {
    const room = createRoomState({ gameType: 'hearts' });
    const minigolf = createMinigolfState([hostPlayer]);
    const result = syncRoomAndGameState(room, minigolf);
    expect(result.clearGameState).toBe(true);
  });

  it('does not clear game state when ref is null but room is playing (regression)', () => {
    const room = createRoomState({ gameType: 'hearts' });
    const result = syncRoomAndGameState(room, null);
    expect(result.room).toEqual(room);
    expect(result.clearGameState).toBe(false);
  });

  it('does not clear game state when stored state matches room game type', () => {
    const room = createRoomState({ gameType: 'hearts' });
    const hearts = createInitialGameState('hearts', [hostPlayer]);
    const result = syncRoomAndGameState(room, hearts);
    expect(result.clearGameState).toBe(false);
  });
});

describe('isJoinSessionReady', () => {
  it('is ready in lobby without game state', () => {
    const room = createRoomState({ phase: 'lobby', gameType: null });
    expect(isJoinSessionReady(room, null)).toBe(true);
  });

  it('is not ready mid-game until matching game state arrives', () => {
    const room = createRoomState({ gameType: 'hearts', phase: 'playing' });
    expect(isJoinSessionReady(room, null)).toBe(false);
    const hearts = createInitialGameState('hearts', [hostPlayer]);
    expect(isJoinSessionReady(room, hearts)).toBe(true);
  });
});
