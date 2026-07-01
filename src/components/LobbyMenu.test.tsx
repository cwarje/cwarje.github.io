import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Player, RoomContextValue, RoomState } from '../networking/types';
import LobbyMenu from './LobbyMenu';

const mockUseRoomContext = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../networking/roomStore', () => ({
  useRoomContext: () => mockUseRoomContext(),
}));

vi.mock('./Toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Cam',
    color: 'blue',
    isBot: false,
    isHost: true,
    connected: true,
    ...overrides,
  };
}

function createRoomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomCode: 'ABCD',
    gameType: null,
    players: [createPlayer()],
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
    myPlayer: createPlayer(),
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

function renderOpenLobbyMenu(contextOverrides: Partial<RoomContextValue> = {}) {
  mockUseRoomContext.mockReturnValue(createRoomContext(contextOverrides));

  render(
    <MemoryRouter>
      <LobbyMenu />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open lobby' }));
}

describe('LobbyMenu host leave button', () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockNavigate.mockClear();
  });

  it('shows Reset Lobby with a rotate icon when host is the only human', () => {
    renderOpenLobbyMenu({
      room: createRoomState({
        players: [
          createPlayer(),
          createPlayer({ id: 'bot-1', name: 'Bot', isBot: true, isHost: false }),
        ],
      }),
    });

    const resetButton = screen.getByRole('button', { name: 'Reset Lobby' });
    expect(resetButton).toBeInTheDocument();
    expect(resetButton.querySelector('.lucide-rotate-ccw')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close Lobby' })).not.toBeInTheDocument();
  });

  it('shows Close Lobby with an X icon when another human is present', () => {
    renderOpenLobbyMenu({
      room: createRoomState({
        players: [
          createPlayer(),
          createPlayer({ id: 'player-2', name: 'Friend', isHost: false }),
        ],
      }),
    });

    const closeButton = screen.getByRole('button', { name: 'Close Lobby' });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton.querySelector('.lucide-x')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset Lobby' })).not.toBeInTheDocument();
  });

  it('shows Lobby reset. toast when solo human host leaves', () => {
    renderOpenLobbyMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Lobby' }));

    expect(mockToast).toHaveBeenCalledWith('Lobby reset.', 'info');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
