import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { RoomContextValue, RoomState } from '../networking/types';
import { GAME_REGISTRY, PRODUCTION_GAME_TYPES } from '../games/registry';
import Home from './Home';

const mockUseRoomContext = vi.fn();

vi.mock('../networking/roomStore', () => ({
  useRoomContext: () => mockUseRoomContext(),
}));

function createRoomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: 'ABCD',
    gameType: null,
    players: [
      {
        id: 'player-1',
        name: 'Cam',
        color: 'blue',
        isBot: false,
        isHost: true,
        connected: true,
      },
    ],
    phase: 'lobby',
    hostId: 'player-1',
    wins: {},
    ...overrides,
  };
}

function createRoomContext(overrides: Partial<RoomContextValue> = {}): RoomContextValue {
  return {
    room: createRoomState(),
    gameState: null,
    isHost: true,
    myId: 'player-1',
    myPlayer: null,
    createLobby: vi.fn().mockResolvedValue('ABCD'),
    joinRoom: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn(),
    rejoinRoom: vi.fn().mockResolvedValue(undefined),
    leaveRoom: vi.fn(),
    removePlayer: vi.fn(),
    addBot: vi.fn(),
    removeBot: vi.fn(),
    startGame: vi.fn(),
    sendAction: vi.fn(),
    returnToLobby: vi.fn(),
    endGame: vi.fn(),
    error: null,
    clearError: vi.fn(),
    connecting: false,
    reconnecting: false,
    ...overrides,
  };
}

describe('Home', () => {
  it('renders production game cards for a host in lobby', () => {
    mockUseRoomContext.mockReturnValue(createRoomContext());

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    for (const gameType of PRODUCTION_GAME_TYPES) {
      expect(
        screen.getByRole('heading', { name: GAME_REGISTRY[gameType].title }),
      ).toBeInTheDocument();
    }
  });

  it('prompts for player name when no room and no saved profile', async () => {
    window.localStorage.removeItem('playerName');
    window.localStorage.removeItem('playerColor');

    const createLobby = vi.fn().mockResolvedValue('ABCD');
    mockUseRoomContext.mockReturnValue(
      createRoomContext({ room: null, createLobby }),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enter Your Name' })).toBeInTheDocument();
    });

    expect(createLobby).not.toHaveBeenCalled();
  });
});
