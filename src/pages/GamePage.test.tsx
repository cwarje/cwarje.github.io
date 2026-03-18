import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RoomContextValue, RoomState } from '../networking/types';
import GamePage from './GamePage';

const mockUseRoomContext = vi.fn();
const mockToast = vi.fn();

vi.mock('../networking/roomStore', () => ({
  useRoomContext: () => mockUseRoomContext(),
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

function createRoomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: 'ABCD',
    gameType: null,
    players: [
      {
        id: 'host-1',
        name: 'Host',
        color: 'blue',
        isBot: false,
        isHost: true,
        connected: true,
      },
    ],
    phase: 'playing',
    hostId: 'host-1',
    wins: {},
    ...overrides,
  };
}

function createRoomContext(overrides: Partial<RoomContextValue> = {}): RoomContextValue {
  return {
    room: createRoomState(),
    gameState: { demo: true },
    isHost: true,
    myId: 'host-1',
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

function renderGamePage() {
  return render(
    <MemoryRouter initialEntries={['/game/ABCD']}>
      <Routes>
        <Route path="/game/:roomCode" element={<GamePage />} />
        <Route path="/" element={<div>Home Route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GamePage', () => {
  it('shows loading state when room data is missing', () => {
    mockUseRoomContext.mockReturnValue(
      createRoomContext({ room: null, gameState: null, connecting: false }),
    );

    renderGamePage();

    expect(screen.getByText('Loading game...')).toBeInTheDocument();
  });

  it('shows reconnecting overlay while reconnecting', () => {
    mockUseRoomContext.mockReturnValue(
      createRoomContext({ reconnecting: true }),
    );

    renderGamePage();

    expect(screen.getAllByText('Reconnecting...').length).toBeGreaterThan(0);
  });

  it('lets host return to lobby when game is finished', () => {
    const returnToLobby = vi.fn();
    mockUseRoomContext.mockReturnValue(
      createRoomContext({
        room: createRoomState({ phase: 'finished' }),
        returnToLobby,
      }),
    );

    renderGamePage();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Lobby' }));

    expect(returnToLobby).toHaveBeenCalledTimes(1);
  });
});
