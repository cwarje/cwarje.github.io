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
    dealerSpeed: 'medium',
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
    setDealerSpeed: vi.fn(),
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
    window.localStorage.removeItem('dealerSpeed');

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

  it('shows personalized waiting heading for non-host in lobby', () => {
    mockUseRoomContext.mockReturnValue(
      createRoomContext({
        isHost: false,
        myId: 'player-2',
        room: createRoomState({
          players: [
            {
              id: 'player-1',
              name: 'Cam',
              color: 'blue',
              isBot: false,
              isHost: true,
              connected: true,
            },
            {
              id: 'player-2',
              name: 'Alex',
              color: 'green',
              isBot: false,
              isHost: false,
              connected: true,
            },
          ],
        }),
      }),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Waiting for Cam to pick a game' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('The host will pick a game to start.')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for the host to pick a game...')).not.toBeInTheDocument();
  });

  it('shows singular waiting message for host with one other player', () => {
    mockUseRoomContext.mockReturnValue(
      createRoomContext({
        room: createRoomState({
          players: [
            {
              id: 'player-1',
              name: 'Cam',
              color: 'blue',
              isBot: false,
              isHost: true,
              connected: true,
            },
            {
              id: 'player-2',
              name: 'Alex',
              color: 'green',
              isBot: false,
              isHost: false,
              connected: true,
            },
          ],
        }),
      }),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Alex is waiting for you to pick a game' }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('ROOM CODE')).not.toBeInTheDocument();
  });

  it('shows plural waiting message for host with multiple other players', () => {
    mockUseRoomContext.mockReturnValue(
      createRoomContext({
        room: createRoomState({
          players: [
            {
              id: 'player-1',
              name: 'Cam',
              color: 'blue',
              isBot: false,
              isHost: true,
              connected: true,
            },
            {
              id: 'player-2',
              name: 'Alex',
              color: 'green',
              isBot: false,
              isHost: false,
              connected: true,
            },
            {
              id: 'player-3',
              name: 'Sam',
              color: 'red',
              isBot: false,
              isHost: false,
              connected: true,
            },
          ],
        }),
      }),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Alex, Sam are waiting for you to pick a game' }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('ROOM CODE')).not.toBeInTheDocument();
  });

  it('shows join bar for host alone in lobby', () => {
    mockUseRoomContext.mockReturnValue(createRoomContext());

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText('ROOM CODE')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /waiting for you to pick a game/i })).not.toBeInTheDocument();
  });
});
