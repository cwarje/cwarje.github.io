import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import type { RoomContextValue, RoomState } from '../networking/types';

vi.mock('../siteTheme', () => ({
  SITE_XMAS_THEME_ENABLED: true,
}));

vi.mock('../networking/roomStore', () => ({
  useRoomContext: () => mockUseRoomContext(),
}));

const mockUseRoomContext = vi.fn();

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
    updatePlayerXp: vi.fn(),
    updateSelectedHat: vi.fn(),
    error: null,
    clearError: vi.fn(),
    connecting: false,
    reconnecting: false,
    ...overrides,
  };
}

import { PRODUCTION_GAME_TYPES } from '../games/registry';
import Home from './Home';

describe('Home christmas theme', () => {
  it('renders snowfall when SITE_XMAS_THEME_ENABLED is true', () => {
    mockUseRoomContext.mockReturnValue(createRoomContext());

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-snowfall')).toBeInTheDocument();
  });

  it('renders a snow cap on each game card when SITE_XMAS_THEME_ENABLED is true', () => {
    mockUseRoomContext.mockReturnValue(createRoomContext());

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId('game-card-snow-cap')).toHaveLength(PRODUCTION_GAME_TYPES.length);
  });
});